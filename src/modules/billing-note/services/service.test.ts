import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../order/service', () => ({ orderService: { listOrders: vi.fn() } }));
vi.mock('../../customers/repository', () => ({
  customersRepository: { findById: vi.fn(), findByIds: vi.fn() }
}));
vi.mock('../repository/billing-note.repository', () => ({
  billingNoteRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    createBillingNote: vi.fn(),
    updateBillingNote: vi.fn(),
    setDocumentNumber: vi.fn(),
    deleteBillingNote: vi.fn()
  }
}));
vi.mock('../repository/billing-note-order.repository', () => ({
  billingNoteOrderRepository: { listBilledOrderIds: vi.fn(), create: vi.fn(), find: vi.fn(), deleteByBillingNoteId: vi.fn() }
}));
vi.mock('../../receipt-note/repository/receipt-note-billing-note.repository', () => ({
  receiptNoteBillingNoteRepository: { isBillingNoteReceipted: vi.fn() }
}));
vi.mock('../../../shared/pdf', () => ({ renderHtmlToPdf: vi.fn(async () => Buffer.from('pdf')) }));
vi.mock('../../../shared/gcs', () => ({
  correctionDepartmentBucketName: 'bucket',
  createSignedObjectDownloadUrl: vi.fn(),
  deleteObjectFromBucket: vi.fn(),
  uploadObjectToBucket: vi.fn()
}));
vi.mock('../../../shared/persistence', () => ({
  nextSequence: vi.fn(async () => 7),
  runInTransaction: vi.fn(async (fn: any) => fn({}))
}));
vi.mock('../billing-note-document-template', () => ({
  buildBillingNoteDocumentHtml: vi.fn(() => '<html/>')
}));

import { billingNoteService } from './service';
import { orderService } from '../../order/service';
import { customersRepository } from '../../customers/repository';
import { billingNoteRepository } from '../repository/billing-note.repository';
import { billingNoteOrderRepository } from '../repository/billing-note-order.repository';
import { uploadObjectToBucket } from '../../../shared/gcs';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { receiptNoteBillingNoteRepository } from '../../receipt-note/repository/receipt-note-billing-note.repository';

const listOrders = vi.mocked(orderService.listOrders);
const notes = vi.mocked(billingNoteRepository);

beforeEach(() => vi.resetAllMocks());

describe('getBillingNotes', () => {
  it('rejects a malformed month', async () => {
    await expect(billingNoteService.getBillingNotes('nope')).rejects.toThrow('YYYY-MM');
  });

  it('queries the whole month and attaches customer names', async () => {
    const customerId = new Types.ObjectId();
    notes.list.mockResolvedValue({ data: [{ customerId }], page: 1, pageSize: 1, total: 1 } as any);
    vi.mocked(customersRepository.findByIds).mockResolvedValue([{ _id: customerId, customerName: 'ACME' }] as any);

    const result = await billingNoteService.getBillingNotes('2026-02');

    const [start, end] = notes.list.mock.calls[0];
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(28);
    expect((result.data[0] as any).customerName).toBe('ACME');
  });
});

describe('getEligibleOrders', () => {
  it('rejects bad or reversed ranges', async () => {
    await expect(billingNoteService.getEligibleOrders('x', '2026-01', 'c')).rejects.toThrow('YYYY-MM');
    await expect(billingNoteService.getEligibleOrders('2026-03', '2026-01', 'c')).rejects.toThrow('startDate');
  });

  it('excludes orders that already have a billing note', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    listOrders.mockResolvedValue({ data: [{ _id: a }, { _id: b }], page: 1, pageSize: 2, total: 2 } as any);
    vi.mocked(billingNoteOrderRepository.listBilledOrderIds).mockResolvedValue([a]);

    const result = await billingNoteService.getEligibleOrders('2026-01', '2026-01', 'c');
    expect(result.data.map((o) => o._id)).toEqual([b]);
  });
});

describe('createBillingNote', () => {
  it('404s when any requested order is missing', async () => {
    listOrders.mockResolvedValue({ data: [{ _id: new Types.ObjectId() }] } as any);
    await expect(
      billingNoteService.createBillingNote(['a', 'b'], new Date(), 'c')
    ).rejects.toThrow(NotFoundError);
    expect(notes.createBillingNote).not.toHaveBeenCalled();
  });

  it('sums order totals, links orders and stores a BL document number', async () => {
    const o1 = { _id: new Types.ObjectId(), totalAmount: 0.1 };
    const o2 = { _id: new Types.ObjectId(), totalAmount: 0.2 };
    listOrders.mockResolvedValue({ data: [o1, o2] } as any);
    const created = { _id: new Types.ObjectId() };
    notes.createBillingNote.mockResolvedValue(created as any);
    notes.setDocumentNumber.mockResolvedValue({ ...created, documentNumber: 'BL20260207' } as any);
    vi.mocked(customersRepository.findById).mockResolvedValue({ _id: 'c' } as any);

    await billingNoteService.createBillingNote(['a', 'b'], new Date('2026-02-10'), 'c');

    expect(notes.createBillingNote.mock.calls[0][0]).toMatchObject({ totalAmount: 0.3 });
    expect(vi.mocked(billingNoteOrderRepository.create).mock.calls[0][0].orderIds).toEqual([o1._id, o2._id]);
    expect(notes.setDocumentNumber).toHaveBeenCalledWith(created._id.toString(), 'BL20260207');
    expect(uploadObjectToBucket).toHaveBeenCalledWith('bucket', 'BL/BL20260207.pdf', expect.anything(), 'application/pdf');
  });
});

describe('updateBillingNote', () => {
  const noteId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const existing = { _id: noteId, customerId, issuedDate: new Date('2026-02-10'), documentNumber: 'BL20260207' };

  it('404s for a missing note and 409s once receipted', async () => {
    notes.findById.mockResolvedValue(null as any);
    await expect(billingNoteService.updateBillingNote('x', ['a'])).rejects.toThrow(NotFoundError);

    notes.findById.mockResolvedValue(existing as any);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(true);
    await expect(billingNoteService.updateBillingNote('x', ['a'])).rejects.toThrow(ConflictError);
    expect(notes.updateBillingNote).not.toHaveBeenCalled();
  });

  it('404s when an order is missing, not the customer\'s or has no delivery note', async () => {
    notes.findById.mockResolvedValue(existing as any);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(false);
    listOrders.mockResolvedValue({ data: [{ _id: new Types.ObjectId() }] } as any);
    await expect(billingNoteService.updateBillingNote('x', ['a', 'b'])).rejects.toThrow(NotFoundError);
  });

  it('409s when an order is already on another billing note', async () => {
    const o1 = { _id: new Types.ObjectId(), totalAmount: 1 };
    notes.findById.mockResolvedValue(existing as any);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(false);
    listOrders.mockResolvedValue({ data: [o1] } as any);
    vi.mocked(billingNoteOrderRepository.find).mockResolvedValue([] as any);
    vi.mocked(billingNoteOrderRepository.listBilledOrderIds).mockResolvedValue([o1._id]);
    await expect(billingNoteService.updateBillingNote('x', ['a'])).rejects.toThrow(ConflictError);
    expect(vi.mocked(billingNoteOrderRepository.deleteByBillingNoteId)).not.toHaveBeenCalled();
  });

  it('replaces orders, recalculates the total and re-renders under the same number', async () => {
    const kept = { _id: new Types.ObjectId(), totalAmount: 0.1 };
    const added = { _id: new Types.ObjectId(), totalAmount: 0.2 };
    notes.findById.mockResolvedValue(existing as any);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(false);
    listOrders.mockResolvedValue({ data: [kept, added] } as any);
    vi.mocked(billingNoteOrderRepository.find).mockResolvedValue([{ orderId: kept._id }] as any);
    vi.mocked(billingNoteOrderRepository.listBilledOrderIds).mockResolvedValue([kept._id]);
    notes.updateBillingNote.mockResolvedValue({ ...existing, totalAmount: 0.3 } as any);
    notes.setDocumentNumber.mockResolvedValue({ ...existing, totalAmount: 0.3 } as any);
    vi.mocked(customersRepository.findById).mockResolvedValue({ _id: 'c' } as any);

    await billingNoteService.updateBillingNote(noteId.toString(), ['a', 'a', 'b']);

    expect(notes.updateBillingNote.mock.calls[0][1]).toMatchObject({ totalAmount: 0.3 });
    expect(vi.mocked(billingNoteOrderRepository.deleteByBillingNoteId)).toHaveBeenCalled();
    expect(vi.mocked(billingNoteOrderRepository.create).mock.calls[0][0].orderIds).toEqual([kept._id, added._id]);
    expect(uploadObjectToBucket).toHaveBeenCalledWith('bucket', 'BL/BL20260207.pdf', expect.anything(), 'application/pdf');
  });
});

describe('document guards', () => {
  it('manualInsertBillingNote / download 404 for a missing billing note', async () => {
    notes.findById.mockResolvedValue(null as any);
    await expect(billingNoteService.manualInsertBillingNote('x')).rejects.toThrow(NotFoundError);
    await expect(billingNoteService.getBillingNoteDocumentDownloadUrl('x')).rejects.toThrow(NotFoundError);
  });

  it('download 404s when no document was generated yet', async () => {
    notes.findById.mockResolvedValue({ _id: 'x' } as any);
    await expect(billingNoteService.getBillingNoteDocumentDownloadUrl('x')).rejects.toThrow(NotFoundError);
  });

  it('generateBillingNoteDocument 404s for an unknown customer', async () => {
    vi.mocked(customersRepository.findById).mockResolvedValue(null as any);
    await expect(billingNoteService.generateBillingNoteDocument(new Date(), 'c', [])).rejects.toThrow(NotFoundError);
  });

  it('deleteBillingNote refuses once receipted', async () => {
    const { receiptNoteBillingNoteRepository } = await import(
      '../../receipt-note/repository/receipt-note-billing-note.repository'
    );
    notes.findById.mockResolvedValue({ _id: 'x', documentNumber: 'BL1' } as any);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(true);
    await expect(billingNoteService.deleteBillingNote('x')).rejects.toThrow(ConflictError);
    expect(notes.deleteBillingNote).not.toHaveBeenCalled();
  });
});
