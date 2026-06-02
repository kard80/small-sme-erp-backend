import { extname } from 'node:path';
import { ClientSession } from 'mongoose';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { creditService, mapOrderStatusFromCredit } from '../credit/service';
import { customersRepository } from '../customers/repository';
import { financeRepository } from '../finance/repository';
import { productRepository } from '../product/repository';
import { CreateOrderInput, CreditStatus, OrderStatus } from '../../shared/types';
import { BadRequestError, InternalServerError } from '../../shared/errors';
import { createSignedImageUploadUrl } from '../../shared/gcs';
import { runInTransaction } from '../../shared/persistence';
import { createOpenAiClient, getOpenAiModel } from '../../shared/openai';
import { orderRepository } from './repository';

const orderOcrSchema = z.object({
  productName: z.string().trim().min(1).nullable(),
  unit: z.string().trim().min(1).nullable(),
  buyPrice: z.number().nonnegative().nullable(),
  sellPrice: z.number().nonnegative().nullable(),
  customerId: z.number().int().positive().nullable(),
  customerName: z.string().trim().min(1).nullable(),
  dueDate: z.string().trim().min(1).nullable(),
  status: z.enum(['pending', 'completed', 'cancelled']).nullable(),
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
  status: parsed.status ?? undefined,
  notes: parsed.notes
});

export const orderService = {
  createOrder(input: CreateOrderInput) {
    return runInTransaction(async (session) => {
      const order = await orderRepository.create(input, session);
      const credit = await creditService.createCreditForOrder(order, session);
      return { order, credit };
    });
  },

  listOrders(page: number, pageSize: number) {
    return orderRepository.list(page, pageSize);
  },

  getOrder(id: number) {
    return orderRepository.findById(id);
  },

  async updateOrder(id: number, input: Partial<CreateOrderInput>, session?: ClientSession) {
    const run = async (activeSession?: ClientSession) => {
      const order = await orderRepository.update(id, input, activeSession);
      if (!order) {
        return undefined;
      }

      await creditService.updateCreditFromOrder(order.id, input, activeSession);
      return order;
    };

    return session ? run(session) : runInTransaction(run);
  },

  async updateOrderStatusFromCredit(orderId: number, status: CreditStatus, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order || order.status === 'cancelled') {
      return order;
    }

    return orderRepository.update(orderId, { status: mapOrderStatusFromCredit(status) }, session);
  },

  async resetOrderStatusAfterCreditRemoval(orderId: number, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order) {
      return undefined;
    }
    if (order.status === 'cancelled') {
      return order;
    }

    return orderRepository.update(orderId, { status: 'pending' }, session);
  },

  setOrderStatus(orderId: number, status: OrderStatus, session?: ClientSession) {
    return orderRepository.update(orderId, { status }, session);
  },

  removeOrder(id: number) {
    return runInTransaction(async (session) => {
      const order = await orderRepository.remove(id, session);
      if (!order) {
        return undefined;
      }

      const credits = await creditService.removeCreditsForOrder(order.id, session);
      await Promise.all(credits.map((credit) => financeRepository.removeByCreditId(credit.id, session)));
      return { order, credits };
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
      extracted.customerId
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
        customerId: extracted.customerId ?? matchedCustomer?.customerId,
        dueDate: extracted.dueDate,
        status: extracted.status ?? 'pending'
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
              customerId: matchedCustomer.customerId,
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
      createdAt: new Date().toISOString()
    });

    return {
      requestId: batch.id,
      folderName: batch.folderName,
      createdAt: batch.createdAt,
      uploads
    };
  }
};
