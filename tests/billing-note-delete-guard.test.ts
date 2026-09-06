import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/billing-note/repository/billing-note.repository', () => ({
  billingNoteRepository: {
    findById: vi.fn(),
    list: vi.fn(),
    findByIds: vi.fn(),
    createBillingNote: vi.fn(),
    setDocumentNumber: vi.fn(),
    deleteBillingNote: vi.fn()
  }
}));

vi.mock('../src/modules/billing-note/repository/billing-note-order.repository', () => ({
  billingNoteOrderRepository: {
    find: vi.fn(),
    listBilledOrderIds: vi.fn(),
    isOrderBilled: vi.fn(),
    create: vi.fn(),
    deleteByBillingNoteId: vi.fn()
  }
}));

vi.mock('../src/modules/receipt-note/repository/receipt-note-billing-note.repository', () => ({
  receiptNoteBillingNoteRepository: {
    isBillingNoteReceipted: vi.fn()
  }
}));

vi.mock('../src/shared/gcs', () => ({
  correctionDepartmentBucketName: 'correction-department-private',
  createSignedObjectDownloadUrl: vi.fn(),
  deleteObjectFromBucket: vi.fn(),
  uploadObjectToBucket: vi.fn()
}));

vi.mock('../src/shared/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/shared/persistence')>();
  return {
    ...actual,
    nextSequence: vi.fn(),
    runInTransaction: vi.fn(async (work: (session: undefined) => Promise<unknown>) => work(undefined))
  };
});

import { billingNoteService } from '../src/modules/billing-note/services/service';
import { billingNoteRepository } from '../src/modules/billing-note/repository/billing-note.repository';
import { billingNoteOrderRepository } from '../src/modules/billing-note/repository/billing-note-order.repository';
import { receiptNoteBillingNoteRepository } from '../src/modules/receipt-note/repository/receipt-note-billing-note.repository';
import { deleteObjectFromBucket } from '../src/shared/gcs';
import { ConflictError, NotFoundError } from '../src/shared/errors';

const billingNoteId = new Types.ObjectId().toString();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('billingNoteService.deleteBillingNote', () => {
  it('throws ConflictError and leaves the billing note in place when it has already been receipted', async () => {
    vi.mocked(billingNoteRepository.findById).mockResolvedValue({
      _id: billingNoteId,
      documentNumber: 'BL20260101'
    } as never);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(true);

    await expect(billingNoteService.deleteBillingNote(billingNoteId)).rejects.toThrow(ConflictError);

    expect(billingNoteOrderRepository.deleteByBillingNoteId).not.toHaveBeenCalled();
    expect(billingNoteRepository.deleteBillingNote).not.toHaveBeenCalled();
    expect(deleteObjectFromBucket).not.toHaveBeenCalled();
  });

  it('deletes the billing note, its order links, and its PDF when it has not been receipted', async () => {
    vi.mocked(billingNoteRepository.findById).mockResolvedValue({
      _id: billingNoteId,
      documentNumber: 'BL20260101'
    } as never);
    vi.mocked(receiptNoteBillingNoteRepository.isBillingNoteReceipted).mockResolvedValue(false);

    await billingNoteService.deleteBillingNote(billingNoteId);

    expect(billingNoteOrderRepository.deleteByBillingNoteId).toHaveBeenCalledWith(billingNoteId, undefined);
    expect(billingNoteRepository.deleteBillingNote).toHaveBeenCalledWith(billingNoteId, undefined);
    expect(deleteObjectFromBucket).toHaveBeenCalledWith('correction-department-private', 'BL/BL20260101.pdf');
  });

  it('throws NotFoundError when the billing note does not exist, without checking receipt status', async () => {
    vi.mocked(billingNoteRepository.findById).mockResolvedValue(null);

    await expect(billingNoteService.deleteBillingNote(billingNoteId)).rejects.toThrow(NotFoundError);
    expect(receiptNoteBillingNoteRepository.isBillingNoteReceipted).not.toHaveBeenCalled();
  });
});
