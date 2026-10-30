import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../customers/repository', () => ({
  customersRepository: { findById: vi.fn() }
}));
vi.mock('./repository/order.repository', () => ({
  orderRepository: {
    create: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    existsByDeliveryNote: vi.fn(),
    getSummary: vi.fn()
  }
}));
vi.mock('./repository/order-item.repository', () => ({
  orderItemRepository: {
    createMany: vi.fn(),
    listByOrderId: vi.fn(),
    hardDeleteByOrderId: vi.fn(),
    removeByOrderId: vi.fn(),
    updateLifecycleByOrderId: vi.fn()
  }
}));
vi.mock('../billing-note/repository/billing-note-order.repository', () => ({
  billingNoteOrderRepository: { listBilledOrderIds: vi.fn(), isOrderBilled: vi.fn() }
}));
vi.mock('./delivery-note', () => ({
  generateDeliveryNoteNumber: vi.fn(),
  generateDeliveryNotePdfBuffer: vi.fn()
}));
vi.mock('../../shared/gcs', () => ({
  correctionDepartmentBucketName: 'bucket',
  createSignedObjectDownloadUrl: vi.fn(async () => 'https://signed'),
  uploadObjectToBucket: vi.fn()
}));
vi.mock('../../shared/persistence', () => ({
  runInTransaction: vi.fn(async (fn: any) => fn({})),
  withSession: vi.fn(async (session: any, fn: any) => fn(session ?? {}))
}));

import { orderService } from './service';
import { customersRepository } from '../customers/repository';
import { orderRepository } from './repository/order.repository';
import { orderItemRepository } from './repository/order-item.repository';
import { billingNoteOrderRepository } from '../billing-note/repository/billing-note-order.repository';
import { generateDeliveryNoteNumber, generateDeliveryNotePdfBuffer } from './delivery-note';
import { createSignedObjectDownloadUrl, uploadObjectToBucket } from '../../shared/gcs';
import { Pagination } from '../../shared/pagination';
import { ConflictError, BadRequestError, NotFoundError } from '../../shared/errors';

const customers = vi.mocked(customersRepository);
const orders = vi.mocked(orderRepository);
const items = vi.mocked(orderItemRepository);
const billed = vi.mocked(billingNoteOrderRepository);

const customerId = new Types.ObjectId();
const orderId = new Types.ObjectId();

const baseInput = (status: 'draft' | 'completed') => ({
  customerId: customerId.toString(),
  dueDate: new Date('2026-02-01'),
  deliveryDate: new Date('2026-01-01'),
  status,
  items: [
    { productId: 'p1', productName: 'a', unit: 'kg', quantity: 3, buyPrice: 1.1, sellPrice: 2.55 },
    { productId: 'p2', productName: 'b', unit: 'kg', quantity: 2, buyPrice: 0.5, sellPrice: 1 }
  ]
});

const order = (extra: Record<string, unknown> = {}) =>
  ({
    _id: orderId,
    customerId,
    customerBillName: 'bill',
    customerBillAddress: 'addr',
    completedAt: null,
    cancelledAt: null,
    dueDate: new Date(),
    deliveryDate: new Date(),
    ...extra
  }) as any;

beforeEach(() => {
  vi.resetAllMocks();
  customers.findById.mockResolvedValue({ _id: customerId, billName: 'bill', address: 'addr' } as any);
  orders.create.mockImplementation(async (input: any) => ({ _id: orderId, ...input }) as any);
  orders.update.mockImplementation(async (_id: any, patch: any) => order(patch));
  items.createMany.mockResolvedValue([] as any);
  billed.listBilledOrderIds.mockResolvedValue([]);
  billed.isOrderBilled.mockResolvedValue(false);
  vi.mocked(generateDeliveryNoteNumber).mockResolvedValue('DN20260101');
  vi.mocked(generateDeliveryNotePdfBuffer).mockResolvedValue({
    filename: 'DN20260101.pdf',
    bytes: Buffer.from('x'),
    contentType: 'application/pdf'
  } as any);
});

describe('orderService.createOrder', () => {
  it('derives totals with 2dp rounding and stays draft without a delivery note', async () => {
    const { order: created } = await orderService.createOrder(baseInput('draft') as any);
    // 2.55*3 + 1*2 = 9.65 ; 1.1*3 + 0.5*2 = 4.3
    expect(created.totalAmount).toBe(9.65);
    expect(created.totalExpense).toBe(4.3);
    expect(created.completedAt).toBeNull();
    expect(generateDeliveryNoteNumber).not.toHaveBeenCalled();
    expect(uploadObjectToBucket).not.toHaveBeenCalled();
  });

  it('rejects an unknown customer', async () => {
    customers.findById.mockResolvedValue(null as any);
    await expect(orderService.createOrder(baseInput('draft') as any)).rejects.toThrow(BadRequestError);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('creates and uploads a delivery note for a completed order', async () => {
    orders.update.mockResolvedValue(order({ completedAt: new Date(), deliveryNote: 'DN20260101' }));
    const { order: created } = await orderService.createOrder(baseInput('completed') as any);
    expect(created.deliveryNote).toBe('DN20260101');
    expect(uploadObjectToBucket).toHaveBeenCalledWith('bucket', 'DN/DN20260101.pdf', expect.anything(), 'application/pdf');
  });
});

describe('orderService.listOrders', () => {
  it('marks editable: drafts yes, billed completed no, unbilled completed yes, cancelled no', async () => {
    const draft = order({ _id: new Types.ObjectId() });
    const billedDone = order({ _id: new Types.ObjectId(), completedAt: new Date() });
    const freeDone = order({ _id: new Types.ObjectId(), completedAt: new Date() });
    const cancelled = order({ _id: new Types.ObjectId(), cancelledAt: new Date() });
    orders.list.mockResolvedValue({ data: [draft, billedDone, freeDone, cancelled], page: 1, pageSize: 4, total: 4 });
    billed.listBilledOrderIds.mockResolvedValue([billedDone._id]);

    const result = await orderService.listOrders({ pagination: new Pagination() });
    expect(result.data.map((o) => o.editable)).toEqual([true, false, true, false]);
  });
});

describe('orderService.updateOrder', () => {
  it('returns undefined when the order does not exist', async () => {
    orders.findById.mockResolvedValue(null as any);
    expect(await orderService.updateOrder(orderId.toString(), {})).toBeUndefined();
  });

  it('rejects editing a billed completed order', async () => {
    orders.findById.mockResolvedValue(order({ completedAt: new Date() }));
    billed.isOrderBilled.mockResolvedValue(true);
    await expect(orderService.updateOrder(orderId.toString(), { status: 'completed' })).rejects.toThrow(BadRequestError);
  });

  it('rejects reverting a completed order to draft', async () => {
    orders.findById.mockResolvedValue(order({ completedAt: new Date() }));
    await expect(orderService.updateOrder(orderId.toString(), { status: 'draft' })).rejects.toThrow(BadRequestError);
  });

  it('replaces items by hard delete and recalculates totals on a draft edit', async () => {
    orders.findById.mockResolvedValue(order());
    items.createMany.mockResolvedValue([
      { totalSellPrice: 5.1, totalBuyPrice: 2.2 },
      { totalSellPrice: 0.2, totalBuyPrice: 0.1 }
    ] as any);

    await orderService.updateOrder(orderId.toString(), { status: 'draft', items: baseInput('draft').items } as any);

    expect(items.hardDeleteByOrderId).toHaveBeenCalled();
    expect(items.removeByOrderId).not.toHaveBeenCalled();
    expect(orders.update.mock.calls[0][1]).toMatchObject({ totalAmount: 5.3, totalExpense: 2.3 });
  });

  it('rejects an edit that leaves the order with no items', async () => {
    orders.findById.mockResolvedValue(order());
    items.listByOrderId.mockResolvedValue([]);
    await expect(orderService.updateOrder(orderId.toString(), { status: 'draft' })).rejects.toThrow(BadRequestError);
  });

  it('generates a delivery note when a draft is completed', async () => {
    orders.findById.mockResolvedValue(order());
    items.listByOrderId.mockResolvedValue([{ totalSellPrice: 1, totalBuyPrice: 1 }] as any);
    items.updateLifecycleByOrderId.mockResolvedValue([{ totalSellPrice: 1, totalBuyPrice: 1 }] as any);

    await orderService.updateOrder(orderId.toString(), { status: 'completed' });

    expect(uploadObjectToBucket).toHaveBeenCalled();
    expect(orders.update.mock.calls.at(-1)![1]).toEqual({ deliveryNote: 'DN20260101' });
  });
});

describe('orderService.createDeliveryNote', () => {
  it('returns undefined for a missing order', async () => {
    orders.findById.mockResolvedValue(null as any);
    items.listByOrderId.mockResolvedValue([]);
    expect(await orderService.createDeliveryNote(orderId.toString())).toBeUndefined();
  });

  it('rejects a draft order', async () => {
    orders.findById.mockResolvedValue(order());
    items.listByOrderId.mockResolvedValue([{}] as any);
    await expect(orderService.createDeliveryNote(orderId.toString())).rejects.toThrow(BadRequestError);
  });
});

describe('orderService.createDeliveryNote custom number', () => {
  const completed = (extra: Record<string, unknown> = {}) => order({ completedAt: new Date(), ...extra });

  it('uses a unique custom number and skips the running number', async () => {
    orders.findById.mockResolvedValue(completed());
    items.listByOrderId.mockResolvedValue([{ totalSellPrice: 1 }] as any);
    orders.existsByDeliveryNote.mockResolvedValue(false);
    await orderService.createDeliveryNote(orderId.toString(), 'MY-001');
    expect(generateDeliveryNoteNumber).not.toHaveBeenCalled();
    expect(orders.update.mock.calls.at(-1)![1]).toEqual({ deliveryNote: 'MY-001' });
  });

  it('rejects a duplicate custom number', async () => {
    orders.findById.mockResolvedValue(completed());
    items.listByOrderId.mockResolvedValue([{ totalSellPrice: 1 }] as any);
    orders.existsByDeliveryNote.mockResolvedValue(true);
    await expect(orderService.createDeliveryNote(orderId.toString(), 'MY-001')).rejects.toThrow(ConflictError);
  });

  it('rejects changing the number once one exists', async () => {
    orders.findById.mockResolvedValue(completed({ deliveryNote: 'DN20260101' }));
    items.listByOrderId.mockResolvedValue([{ totalSellPrice: 1 }] as any);
    await expect(orderService.createDeliveryNote(orderId.toString(), 'MY-001')).rejects.toThrow(BadRequestError);
  });

  it('skips generated numbers already taken by a custom entry', async () => {
    orders.findById.mockResolvedValue(completed());
    items.listByOrderId.mockResolvedValue([{ totalSellPrice: 1 }] as any);
    vi.mocked(generateDeliveryNoteNumber).mockResolvedValueOnce('DN20260101').mockResolvedValueOnce('DN20260102');
    orders.existsByDeliveryNote.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await orderService.createDeliveryNote(orderId.toString());
    expect(orders.update.mock.calls.at(-1)![1]).toEqual({ deliveryNote: 'DN20260102' });
  });
});

describe('orderService.getDeliveryNoteDownloadUrl', () => {
  it('404s when the order or delivery note is missing', async () => {
    orders.findById.mockResolvedValue(null as any);
    await expect(orderService.getDeliveryNoteDownloadUrl('x')).rejects.toThrow(NotFoundError);
    orders.findById.mockResolvedValue(order());
    await expect(orderService.getDeliveryNoteDownloadUrl('x')).rejects.toThrow(NotFoundError);
  });

  it('strips a .pdf suffix from the stored delivery note', async () => {
    orders.findById.mockResolvedValue(order({ deliveryNote: 'DN20260101.PDF' }));
    await orderService.getDeliveryNoteDownloadUrl('x');
    expect(createSignedObjectDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'DN/DN20260101.pdf' })
    );
  });
});

describe('orderService.getSummary / removeOrder', () => {
  it('computes profit and rounds to 2dp', async () => {
    orders.getSummary.mockResolvedValue({ revenue: 100.105, expenses: 30.1 });
    expect(await orderService.getSummary()).toEqual({ revenue: 100.11, expenses: 30.1, profit: 70.01 });
  });

  it('soft-removes the order and its items; undefined when not found', async () => {
    orders.remove.mockResolvedValue(order());
    items.removeByOrderId.mockResolvedValue([{}, {}] as any);
    const result = await orderService.removeOrder(orderId.toString());
    expect(result?.orderItems).toHaveLength(2);

    orders.remove.mockResolvedValue(null as any);
    expect(await orderService.removeOrder('x')).toBeUndefined();
  });
});
