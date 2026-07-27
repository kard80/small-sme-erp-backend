import { extname } from 'node:path';
import { ClientSession, Types } from 'mongoose';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { customersRepository } from '../customers/repository';
import { financeRepository } from '../finance/repository';
import { orderItemRepository } from './repository/order-item.repository';
import { productRepository } from '../product/repository';
import { CreateOrderInput, CreditStatus, Order } from '../../shared/types';
import { BadRequestError, InternalServerError, NotFoundError } from '../../shared/errors';
import {
  correctionDepartmentBucketName,
  createSignedImageUploadUrl,
  createSignedObjectDownloadUrl,
  uploadObjectToBucket
} from '../../shared/gcs';
import { runInTransaction, withSession } from '../../shared/persistence';
import { createOpenAiClient, getOpenAiModel } from '../../shared/openai';
import { logger } from '../../shared/logger';
import { generateDeliveryNoteNumber, generateDeliveryNotePdfBuffer } from './delivery-note';
import { OrderCreditPort } from './ports';
import { orderRepository } from './repository/order.repository';
import { ListOrdersProps, OrderWithEditable } from './types';
import { Currency } from '../../shared/currency';
import { billingNoteOrderRepository } from '../billing-note/repository/billing-note-order.repository';

const log = logger.child({ module: 'order' });

let orderCreditPort: OrderCreditPort | undefined;

const getOrderCreditPort = () => {
  if (!orderCreditPort) {
    throw new InternalServerError('Order credit port has not been configured');
  }

  return orderCreditPort;
};

export const configureOrderPorts = (ports: { credit: OrderCreditPort }) => {
  orderCreditPort = ports.credit;
};

const orderOcrSchema = z.object({
  productName: z.string().trim().min(1).nullable(),
  unit: z.string().trim().min(1).nullable(),
  buyPrice: z.number().nonnegative().nullable(),
  sellPrice: z.number().nonnegative().nullable(),
  customerId: z.string().trim().min(1).nullable(),
  customerName: z.string().trim().min(1).nullable(),
  dueDate: z.string().trim().min(1).nullable(),
  status: z.enum(['draft', 'completed']).nullable(),
  notes: z.array(z.string().trim().min(1)).default([])
});

type ParsedOrderOcr = z.infer<typeof orderOcrSchema>;

const imageMimeTypeByExtension: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const getOcrUploadTimestampFolder = () => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

const getFilenameMimeType = (filename: string) => {
  const extension = extname(filename.trim()).toLowerCase();
  const contentType = imageMimeTypeByExtension[extension];
  if (!contentType) {
    throw new BadRequestError(`Unsupported image filename: ${filename}`);
  }

  return contentType;
};

const normalizeParsedOrder = (parsed: ParsedOrderOcr) => ({
  productName: parsed.productName ?? undefined,
  unit: parsed.unit ?? undefined,
  buyPrice: parsed.buyPrice ?? undefined,
  sellPrice: parsed.sellPrice ?? undefined,
  customerId: parsed.customerId ?? undefined,
  customerName: parsed.customerName ?? undefined,
  dueDate: parsed.dueDate ?? undefined,
  deliveryDate: parsed.dueDate ?? undefined,
  status: parsed.status ?? undefined,
  notes: parsed.notes
});

const getOrderLifecycleFields = (status: CreateOrderInput['status']) => {
  const now = new Date();
  return {
    completedAt: status === 'completed' ? now : null,
    cancelledAt: null
  } satisfies Pick<Order, 'completedAt' | 'cancelledAt'>;
};

const isOrderEditable = (order: Pick<Order, 'completedAt' | 'cancelledAt'>, billed: boolean) => {
  if (order.cancelledAt) {
    return false;
  }
  if (!order.completedAt) {
    return true;
  }
  return !billed;
};

const getCustomerBillingSnapshot = async (customerId: string, session?: ClientSession) => {
  const customer = await customersRepository.findById(customerId, session);
  if (!customer) {
    throw new BadRequestError('ไม่พบลูกค้า');
  }

  return {
    customerId: customer._id,
    customerBillName: customer.billName,
    customerBillAddress: customer.address
  };
};

const resolveOrderItems = (
  input: CreateOrderInput,
  customerSnapshot: Awaited<ReturnType<typeof getCustomerBillingSnapshot>>
) => {
  const items = input.items;
  const totalAmount = items
    .reduce((sum, item) => sum.add(new Currency(item.sellPrice).multiply(item.quantity)), new Currency(0))
    .toNumber();
  const totalExpense = items
    .reduce((sum, item) => sum.add(new Currency(item.buyPrice).multiply(item.quantity)), new Currency(0))
    .toNumber();
  const lifecycle = getOrderLifecycleFields(input.status);

  return {
    items,
    lifecycle,
    totalAmount,
    orderInput: {
      customerId: customerSnapshot.customerId,
      customerBillName: customerSnapshot.customerBillName,
      customerBillAddress: customerSnapshot.customerBillAddress,
      customerDepartment: input.customerDepartment,
      materialCategory: input.materialCategory,
      totalAmount,
      totalExpense,
      dueDate: input.dueDate,
      deliveryDate: input.deliveryDate,
      deliveryNote: undefined,
      ...lifecycle
    }
  };
};

const normalizeDeliveryNoteDocumentNumber = (deliveryNote?: string) => {
  const value = deliveryNote?.trim();
  if (!value) {
    return undefined;
  }

  return value.replace(/\.pdf$/i, '');
};

const getDeliveryNoteDocumentNumber = async (order: Pick<Order, 'deliveryNote'>, session?: ClientSession) => {
  const existingDocumentNumber = normalizeDeliveryNoteDocumentNumber(order.deliveryNote);
  if (existingDocumentNumber) {
    return existingDocumentNumber;
  }

  return generateDeliveryNoteNumber(session);
};

// TODO: this is called with an active transaction session from createOrder/updateOrder,
// which means Chromium PDF rendering runs while the MongoDB transaction is open. Move PDF
// generation outside the transaction (generate before the transaction starts, or after it
// commits) so a slow/failed browser launch can't abort the order write. Once done, remove
// the --memory/--cpu bump added to the deploy step in cloudbuild.yaml for this workaround.
const createPreparedDeliveryNote = async (
  order: Order,
  orderItems: Awaited<ReturnType<typeof orderItemRepository.listByOrderId>>,
  session?: ClientSession
) => {
  const documentNumber = await getDeliveryNoteDocumentNumber(order, session);
  const pdf = await generateDeliveryNotePdfBuffer(order, orderItems, documentNumber);

  return {
    documentNumber,
    pdf
  };
};

const persistDeliveryNoteOnOrder = async (order: Order, documentNumber: string, session?: ClientSession) => {
  if (normalizeDeliveryNoteDocumentNumber(order.deliveryNote) === documentNumber) {
    return order;
  }

  const updatedOrder = await orderRepository.update(order._id.toString(), { deliveryNote: documentNumber }, session);
  if (!updatedOrder) {
    throw new InternalServerError('ไม่พบคำสั่งซื้อหลังจากสร้างใบส่งของ');
  }

  return updatedOrder;
};

const upsertDeliveryNoteForOrder = async (
  order: Order,
  orderItems: Awaited<ReturnType<typeof orderItemRepository.listByOrderId>>,
  session?: ClientSession
) => {
  const { documentNumber, pdf: deliveryNotePdf } = await createPreparedDeliveryNote(order, orderItems, session);
  await uploadObjectToBucket(
    correctionDepartmentBucketName,
    `DN/${deliveryNotePdf.filename}`,
    deliveryNotePdf.bytes,
    deliveryNotePdf.contentType
  );

  return persistDeliveryNoteOnOrder(order, documentNumber, session);
};

// Recomputes items/customer/date fields shared by both the draft and completed-order update
// flows, persists them, and returns the updated order along with the recalculated totals.
// Does not touch delivery note or credit records — callers handle those per-flow.
const applyOrderFieldUpdates = async (
  id: string,
  existingOrder: Order,
  input: Partial<CreateOrderInput>,
  nextLifecycle: Pick<Order, 'completedAt' | 'cancelledAt'>,
  activeSession: ClientSession
) => {
  const nextCustomerId = input.customerId ?? existingOrder.customerId.toString();
  const customerSnapshot =
    nextCustomerId === existingOrder.customerId.toString()
      ? {
          customerId: existingOrder.customerId,
          customerBillName: existingOrder.customerBillName,
          customerBillAddress: existingOrder.customerBillAddress
        }
      : await getCustomerBillingSnapshot(nextCustomerId, activeSession);
  const nextDueDate = input.dueDate ?? existingOrder.dueDate;
  const nextDeliveryDate = input.deliveryDate ?? existingOrder.deliveryDate;
  const nextCustomerDepartment = input.customerDepartment ?? existingOrder.customerDepartment;
  const nextMaterialCategory = input.materialCategory ?? existingOrder.materialCategory;

  let orderItems = input.items
    ? await (async () => {
        await orderItemRepository.hardDeleteByOrderId(id, activeSession);
        return orderItemRepository.createMany(id, input.items!, nextLifecycle, activeSession);
      })()
    : await orderItemRepository.listByOrderId(id, activeSession);

  if (orderItems.length === 0) {
    throw new BadRequestError('คำสั่งซื้อต้องมีอย่างน้อย 1 รายการ');
  }

  if (!input.items && nextLifecycle.completedAt) {
    orderItems = await orderItemRepository.updateLifecycleByOrderId(id, nextLifecycle, activeSession);
  }

  const totalAmount = orderItems
    .reduce((total, item) => total.add(new Currency(item.totalSellPrice)), new Currency(0))
    .toNumber();
  const totalExpense = orderItems
    .reduce((total, item) => total.add(new Currency(item.totalBuyPrice)), new Currency(0))
    .toNumber();

  const updatedOrder = await orderRepository.update(
    id,
    {
      customerId: customerSnapshot.customerId,
      customerBillName: customerSnapshot.customerBillName,
      customerBillAddress: customerSnapshot.customerBillAddress,
      customerDepartment: nextCustomerDepartment,
      materialCategory: nextMaterialCategory,
      totalAmount,
      totalExpense,
      dueDate: nextDueDate,
      deliveryDate: nextDeliveryDate,
      completedAt: nextLifecycle.completedAt,
      cancelledAt: nextLifecycle.cancelledAt
    },
    activeSession
  );
  if (!updatedOrder) {
    throw new InternalServerError('ไม่พบคำสั่งซื้อหลังจากอัปเดต');
  }

  return { updatedOrder, orderItems, totalAmount };
};

const generateAndPersistDeliveryNote = async (
  order: Order,
  orderItems: Awaited<ReturnType<typeof orderItemRepository.listByOrderId>>,
  activeSession: ClientSession
) => {
  const preparedDeliveryNote = await createPreparedDeliveryNote(order, orderItems, activeSession);
  const completedOrder = await persistDeliveryNoteOnOrder(order, preparedDeliveryNote.documentNumber, activeSession);
  await uploadObjectToBucket(
    correctionDepartmentBucketName,
    `DN/${preparedDeliveryNote.pdf.filename}`,
    preparedDeliveryNote.pdf.bytes,
    preparedDeliveryNote.pdf.contentType
  );

  return { completedOrder, documentNumber: preparedDeliveryNote.documentNumber };
};

// Normal flow: order was in draft. It either stays a draft, or is completed for the first
// time (no delivery note/credit exist yet, so both are created fresh).
const updateDraftOrder = async (
  id: string,
  existingOrder: Order,
  input: Partial<CreateOrderInput>,
  activeSession: ClientSession
) => {
  const nextStatus = input.status ?? 'draft';
  const nextLifecycle = getOrderLifecycleFields(nextStatus);
  const { updatedOrder, orderItems, totalAmount } = await applyOrderFieldUpdates(
    id,
    existingOrder,
    input,
    nextLifecycle,
    activeSession
  );

  if (nextStatus === 'draft') {
    log.info({ orderId: id, status: 'draft', totalAmount }, 'order updated');
    return { order: updatedOrder, orderItems };
  }

  const { completedOrder, documentNumber } = await generateAndPersistDeliveryNote(
    updatedOrder,
    orderItems,
    activeSession
  );
  const credit = await getOrderCreditPort().createCreditForOrder({ ...completedOrder, totalAmount }, activeSession);

  log.info({ orderId: id, status: 'completed', totalAmount, deliveryNote: documentNumber }, 'order updated');
  return { order: completedOrder, orderItems, credit };
};

// Completed DN flow: order was already completed (and, per the editable check above, not yet
// billed). Downgrading back to draft is not supported here. Items/customer/dates are
// recalculated as usual, then the delivery note PDF is regenerated (same document number, so
// it overwrites the old file in the bucket) and the credit is replaced to reflect the new
// total, with completedAt bumped to the time of this edit.
const updateCompletedOrder = async (
  id: string,
  existingOrder: Order,
  input: Partial<CreateOrderInput>,
  activeSession: ClientSession
) => {
  if (input.status !== 'completed') {
    throw new BadRequestError('ไม่สามารถเปลี่ยนคำสั่งซื้อที่เสร็จสิ้นแล้วกลับเป็นฉบับร่างได้');
  }

  const nextLifecycle = getOrderLifecycleFields('completed');
  const { updatedOrder, orderItems, totalAmount } = await applyOrderFieldUpdates(
    id,
    existingOrder,
    input,
    nextLifecycle,
    activeSession
  );

  const { completedOrder, documentNumber } = await generateAndPersistDeliveryNote(
    updatedOrder,
    orderItems,
    activeSession
  );

  await getOrderCreditPort().removeCreditsForOrder(id, activeSession);
  const credit = await getOrderCreditPort().createCreditForOrder({ ...completedOrder, totalAmount }, activeSession);

  log.info(
    { orderId: id, status: 'completed', totalAmount, deliveryNote: documentNumber },
    'completed order updated'
  );
  return { order: completedOrder, orderItems, credit };
};

export const orderService = {
  createOrder(input: CreateOrderInput) {
    return runInTransaction(async (session) => {
      const customerSnapshot = await getCustomerBillingSnapshot(input.customerId, session);
      const { items, lifecycle, totalAmount, orderInput } = resolveOrderItems(input, customerSnapshot);
      const order = await orderRepository.create(orderInput, session);
      const orderItems = await orderItemRepository.createMany(order._id.toString(), items, lifecycle, session);
      if (!order.completedAt) {
        log.info({ orderId: order._id, customerId: order.customerId, status: 'draft', totalAmount }, 'order created');
        return { order, orderItems };
      }

      const preparedDeliveryNote = await createPreparedDeliveryNote(order, orderItems, session);
      const updatedOrder = await persistDeliveryNoteOnOrder(order, preparedDeliveryNote.documentNumber, session);
      const credit = await getOrderCreditPort().createCreditForOrder({ ...updatedOrder, totalAmount }, session);
      await uploadObjectToBucket(
        correctionDepartmentBucketName,
        `DN/${preparedDeliveryNote.pdf.filename}`,
        preparedDeliveryNote.pdf.bytes,
        preparedDeliveryNote.pdf.contentType
      );

      log.info(
        {
          orderId: updatedOrder._id,
          customerId: updatedOrder.customerId,
          status: 'completed',
          totalAmount,
          deliveryNote: preparedDeliveryNote.documentNumber
        },
        'order created'
      );
      return { order: updatedOrder, orderItems, credit };
    });
  },

  async listOrders(input: ListOrdersProps): Promise<{
    data: OrderWithEditable[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const result = await orderRepository.list(input);
    const billedOrderIds = await billingNoteOrderRepository.listBilledOrderIds(result.data.map((order) => order._id));
    const billedOrderIdSet = new Set(billedOrderIds.map((orderId) => orderId.toString()));

    return {
      ...result,
      data: result.data.map((order) => ({
        ...order,
        editable: isOrderEditable(order, billedOrderIdSet.has(order._id.toString()))
      }))
    };
  },

  getOrder(id: string) {
    return orderRepository.findById(id);
  },

  async getOrderWithItems(id: string, session?: ClientSession) {
    const [order, orderItems] = await Promise.all([
      orderRepository.findById(id, session),
      orderItemRepository.listByOrderId(id, session)
    ]);

    if (!order) {
      return undefined;
    }

    return { order, orderItems };
  },

  async getDeliveryNoteDownloadUrl(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError('ไม่พบคำสั่งซื้อ');
    }
    if (!order.deliveryNote) {
      throw new NotFoundError('ไม่พบใบส่งของสำหรับคำสั่งซื้อนี้');
    }

    const deliveryNoteDocumentNumber = normalizeDeliveryNoteDocumentNumber(order.deliveryNote);
    if (!deliveryNoteDocumentNumber) {
      throw new NotFoundError('ไม่พบใบส่งของสำหรับคำสั่งซื้อนี้');
    }

    return createSignedObjectDownloadUrl({
      bucketName: correctionDepartmentBucketName,
      objectKey: `DN/${deliveryNoteDocumentNumber}.pdf`,
      responseDisposition: `inline; filename="${deliveryNoteDocumentNumber}.pdf"`
    });
  },

  async createDeliveryNote(orderId: string) {
    const orderWithItems = await this.getOrderWithItems(orderId);
    if (!orderWithItems) {
      return undefined;
    }

    const { order, orderItems } = orderWithItems;
    if (!order.completedAt || order.cancelledAt) {
      throw new BadRequestError('สามารถสร้างใบส่งของได้เฉพาะคำสั่งซื้อที่เสร็จสิ้นแล้วเท่านั้น');
    }
    if (orderItems.length === 0) {
      throw new BadRequestError('คำสั่งซื้อต้องมีอย่างน้อย 1 รายการ');
    }

    const updatedOrder = await upsertDeliveryNoteForOrder(order, orderItems);
    log.info({ orderId, deliveryNote: updatedOrder.deliveryNote }, 'delivery note generated');
    return { order: updatedOrder, orderItems };
  },

  updateOrder(id: string, input: Partial<CreateOrderInput>, session?: ClientSession) {
    const run = async (activeSession: ClientSession) => {
      const existingOrder = await orderRepository.findById(id, activeSession);
      if (!existingOrder) {
        return undefined;
      }

      const billed = await billingNoteOrderRepository.isOrderBilled(id);
      if (!isOrderEditable(existingOrder, billed)) {
        throw new BadRequestError('ไม่สามารถแก้ไขคำสั่งซื้อนี้ได้ เนื่องจากถูกใช้สร้างใบวางบิลแล้ว');
      }

      return existingOrder.completedAt
        ? updateCompletedOrder(id, existingOrder, input, activeSession)
        : updateDraftOrder(id, existingOrder, input, activeSession);
    };

    return withSession(session, run);
  },

  async updateOrderStatusFromCredit(orderId: string, status: CreditStatus, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order || order.cancelledAt) {
      return order;
    }

    if (status === 'cancelled') {
      return orderRepository.update(orderId, { cancelledAt: new Date() }, session);
    }

    if (status === 'paid') {
      return orderRepository.update(orderId, { completedAt: order.completedAt ?? new Date() }, session);
    }

    return orderRepository.update(orderId, { completedAt: null, cancelledAt: null }, session);
  },

  async resetOrderStatusAfterCreditRemoval(orderId: string, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order) {
      return undefined;
    }
    if (order.cancelledAt) {
      return order;
    }

    return orderRepository.update(orderId, { completedAt: null, cancelledAt: null }, session);
  },

  async getSummary(startDate?: string, endDate?: string) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const { revenue, expenses } = await orderRepository.getSummary(startDate, endDate);
    return { revenue: round2(revenue), expenses: round2(expenses), profit: round2(revenue - expenses) };
  },

  removeOrder(id: string) {
    return runInTransaction(async (session) => {
      const order = await orderRepository.remove(id, session);
      if (!order) {
        return undefined;
      }

      const orderItems = await orderItemRepository.removeByOrderId(order._id.toString(), session);
      const credits = await getOrderCreditPort().removeCreditsForOrder(order._id.toString(), session);
      await Promise.all(credits.map((credit) => financeRepository.removeByCreditId(credit._id.toString(), session)));
      log.info({ orderId: id, itemCount: orderItems.length, creditCount: credits.length }, 'order removed');
      return { order, orderItems, credits };
    });
  },

  async parseOrderImageUrls(imageUrls: string[]) {
    const client = createOpenAiClient();
    const response = await client.responses.parse({
      model: getOpenAiModel(),
      instructions:
        'Extract order information from the provided images. Return only values that are visible in the images. Use null when a field is missing or unclear. Do not guess.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Read these order images and extract a draft order.'
            },
            ...imageUrls.map((imageUrl) => ({
              type: 'input_image' as const,
              image_url: imageUrl,
              detail: 'high' as const
            }))
          ]
        }
      ],
      text: {
        format: zodTextFormat(orderOcrSchema, 'order_ocr')
      }
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      throw new InternalServerError('OpenAI OCR did not return a structured order draft');
    }

    const extracted = normalizeParsedOrder(parsed);
    const [matchedProduct, matchedCustomer] = await Promise.all([
      extracted.productName ? productRepository.findByProductName(extracted.productName) : Promise.resolve(null),
      extracted.customerId && Types.ObjectId.isValid(extracted.customerId)
        ? customersRepository.findById(extracted.customerId)
        : extracted.customerName
          ? customersRepository.findByCustomerName(extracted.customerName)
          : Promise.resolve(null)
    ]);

    return {
      imageUrls,
      extracted,
      draft: {
        productId: matchedProduct?._id.toString(),
        productName: extracted.productName,
        unit: extracted.unit ?? matchedProduct?.unit,
        buyPrice: extracted.buyPrice ?? matchedProduct?.defaultBuyPrice,
        sellPrice: extracted.sellPrice ?? matchedProduct?.sellPrice,
        customerId: extracted.customerId ?? matchedCustomer?._id.toString(),
        dueDate: extracted.dueDate,
        deliveryDate: extracted.dueDate,
        status: extracted.status ?? 'draft'
      },
      matches: {
        product: matchedProduct
          ? {
              _id: matchedProduct._id.toString(),
              productName: matchedProduct.productName
            }
          : null,
        customer: matchedCustomer
          ? {
              _id: matchedCustomer._id.toString(),
              customerName: matchedCustomer.customerName
            }
          : null
      }
    };
  },

  async createOcrUploadBatch(filenames: string[]) {
    const folderName = getOcrUploadTimestampFolder();
    const uploads = await Promise.all(
      filenames.map(async (filename) => {
        const signedUpload = await createSignedImageUploadUrl({
          contentType: getFilenameMimeType(filename),
          objectPrefix: `orders/ocr/${folderName}`
        });

        return {
          filename,
          ...signedUpload
        };
      })
    );

    const batch = await orderRepository.createOcrUploadBatch({
      folderName,
      filenames: uploads.map((upload) => upload.filename),
      objectKeys: uploads.map((upload) => upload.objectKey),
      createdAt: new Date()
    });

    return {
      requestId: batch._id.toString(),
      folderName: batch.folderName,
      createdAt: batch.createdAt,
      uploads
    };
  }
};
