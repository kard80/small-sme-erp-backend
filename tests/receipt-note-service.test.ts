import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import moment from 'moment';

vi.mock('../src/modules/receipt-note/repository/receipt-note.repository', () => ({
  receiptNoteRepository: {
    findById: vi.fn(),
    list: vi.fn(),
    createReceiptNote: vi.fn(),
    setDocumentNumber: vi.fn(),
    deleteReceiptNote: vi.fn()
  }
}));

vi.mock('../src/modules/receipt-note/repository/receipt-note-billing-note.repository', () => ({
  receiptNoteBillingNoteRepository: {
    find: vi.fn(),
    listReceiptedBillingNoteIds: vi.fn(),
    isBillingNoteReceipted: vi.fn(),
    create: vi.fn(),
    deleteByReceiptNoteId: vi.fn()
  }
}));

vi.mock('../src/modules/billing-note/repository/billing-note.repository', () => ({
  billingNoteRepository: {
    list: vi.fn(),
    findByIds: vi.fn()
  }
}));

vi.mock('../src/modules/customers/repository', () => ({
  customersRepository: {
    findById: vi.fn(),
    findByIds: vi.fn()
  }
}));

vi.mock('../src/shared/pdf', () => ({
  renderHtmlToPdf: vi.fn()
}));

vi.mock('../src/modules/receipt-note/receipt-note-document-template', () => ({
  buildReceiptNoteDocumentHtml: vi.fn(() => '<html></html>')
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

import { receiptNoteService } from '../src/modules/receipt-note/services/service';
import { receiptNoteRepository } from '../src/modules/receipt-note/repository/receipt-note.repository';
import { receiptNoteBillingNoteRepository } from '../src/modules/receipt-note/repository/receipt-note-billing-note.repository';
import { billingNoteRepository } from '../src/modules/billing-note/repository/billing-note.repository';
import { customersRepository } from '../src/modules/customers/repository';
import { nextSequence, runInTransaction } from '../src/shared/persistence';
import { correctionDepartmentBucketName, deleteObjectFromBucket, uploadObjectToBucket } from '../src/shared/gcs';
import { renderHtmlToPdf } from '../src/shared/pdf';
import { ConflictError, NotFoundError } from '../src/shared/errors';

const customerId = new Types.ObjectId().toString();

const makeBillingNote = (overrides: Partial<Record<string, unknown>> = {}) => ({
  _id: new Types.ObjectId(),
  customerId: new Types.ObjectId(customerId),
  issuedDate: new Date('2026-01-05T00:00:00.000Z'),
  totalAmount: 100,
  documentNumber: 'BL20260101',
  createdAt: new Date(),
  deletedAt: null,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runInTransaction).mockImplementation(async (work) => work(undefined as never));
  vi.mocked(receiptNoteBillingNoteRepository.listReceiptedBillingNoteIds).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('receiptNoteService.getReceiptNoteDetail', () => {
  it('returns the receipt note with its customer name and billing notes sorted by issuedDate', async () => {
    const receiptNoteId = new Types.ObjectId().toString();
    const receiptNote = { _id: receiptNoteId, customerId: new Types.ObjectId(customerId), receiptDate: new Date(), totalAmount: 300, documentNumber: 'RC20260101' };
    vi.mocked(receiptNoteRepository.findById).mockResolvedValue(receiptNote as never);
    vi.mocked(customersRepository.findById).mockResolvedValue({ _id: customerId, customerName: 'Acme' } as never);

    const laterBillingNote = makeBillingNote({ _id: new Types.ObjectId(), issuedDate: new Date('2026-01-20T00:00:00.000Z') });
    const earlierBillingNote = makeBillingNote({ _id: new Types.ObjectId(), issuedDate: new Date('2026-01-05T00:00:00.000Z') });
    vi.mocked(receiptNoteBillingNoteRepository.find).mockResolvedValue([
      { billingNoteId: laterBillingNote._id },
      { billingNoteId: earlierBillingNote._id }
    ] as never);
    vi.mocked(billingNoteRepository.findByIds).mockResolvedValue([laterBillingNote, earlierBillingNote] as never);

    const result = await receiptNoteService.getReceiptNoteDetail(receiptNoteId);

    expect(result.customerName).toBe('Acme');
    expect(result.billingNotes).toEqual([earlierBillingNote, laterBillingNote]);
  });

  it('throws NotFoundError when the receipt note does not exist', async () => {
    vi.mocked(receiptNoteRepository.findById).mockResolvedValue(null);

    await expect(receiptNoteService.getReceiptNoteDetail('missing-id')).rejects.toThrow(NotFoundError);
  });
});

describe('receiptNoteService.getEligibleBillingNotes', () => {
  it('excludes billing notes without a documentNumber and billing notes already attached to a receipt', async () => {
    const eligible = makeBillingNote({ documentNumber: 'BL20260101' });
    const missingDocumentNumber = makeBillingNote({ documentNumber: undefined });
    const alreadyReceipted = makeBillingNote({ documentNumber: 'BL20260102' });

    vi.mocked(billingNoteRepository.list).mockResolvedValue({
      data: [eligible, missingDocumentNumber, alreadyReceipted],
      page: 1,
      pageSize: 3,
      total: 3
    } as never);
    vi.mocked(receiptNoteBillingNoteRepository.listReceiptedBillingNoteIds).mockResolvedValue([alreadyReceipted._id]);

    const result = await receiptNoteService.getEligibleBillingNotes('2026-01', '2026-01', customerId);

    expect(result.data).toEqual([eligible]);
  });

  it('throws when the date range is invalid', async () => {
    await expect(receiptNoteService.getEligibleBillingNotes('not-a-month', '2026-01', customerId)).rejects.toThrow(
      'Invalid date format, expected YYYY-MM'
    );
  });

  it('throws when startDate is after endDate', async () => {
    await expect(receiptNoteService.getEligibleBillingNotes('2026-03', '2026-01', customerId)).rejects.toThrow(
      'startDate must not be after endDate'
    );
  });
});

describe('receiptNoteService.createReceiptNote', () => {
  it('sums totalAmount with rounding-safe Currency arithmetic and sorts billing notes by issuedDate before persisting', async () => {
    const laterBillingNote = makeBillingNote({
      _id: new Types.ObjectId(),
      issuedDate: new Date('2026-01-20T00:00:00.000Z'),
      totalAmount: 0.1
    });
    const earlierBillingNote = makeBillingNote({
      _id: new Types.ObjectId(),
      issuedDate: new Date('2026-01-05T00:00:00.000Z'),
      totalAmount: 0.2
    });

    vi.mocked(billingNoteRepository.findByIds).mockResolvedValue([laterBillingNote, earlierBillingNote] as never);

    const createdReceiptNote = { _id: new Types.ObjectId(), customerId, receiptDate: new Date(), totalAmount: 0.3 };
    vi.mocked(receiptNoteRepository.createReceiptNote).mockResolvedValue(createdReceiptNote as never);
    vi.mocked(receiptNoteRepository.setDocumentNumber).mockResolvedValue({ ...createdReceiptNote, documentNumber: 'RC20260101' } as never);

    const generateSpy = vi
      .spyOn(receiptNoteService, 'generateReceiptNoteDocument')
      .mockResolvedValue('RC20260101');

    const receiptDate = new Date('2026-01-25T00:00:00.000Z');
    const result = await receiptNoteService.createReceiptNote(
      [laterBillingNote._id.toString(), earlierBillingNote._id.toString()],
      receiptDate,
      customerId
    );

    expect(receiptNoteRepository.createReceiptNote).toHaveBeenCalledWith(
      expect.objectContaining({ customerId, receiptDate, totalAmount: 0.3 }),
      undefined
    );
    expect(receiptNoteBillingNoteRepository.create).toHaveBeenCalledWith(
      {
        receiptNoteId: createdReceiptNote._id,
        billingNoteIds: [earlierBillingNote._id, laterBillingNote._id]
      },
      undefined
    );
    expect(generateSpy).toHaveBeenCalledWith(receiptDate, customerId, [earlierBillingNote, laterBillingNote]);
    expect(result).toMatchObject({ documentNumber: 'RC20260101' });
  });

  it('throws NotFoundError when a billing note id does not resolve to that customer', async () => {
    const otherCustomerBillingNote = makeBillingNote({ customerId: new Types.ObjectId() });
    vi.mocked(billingNoteRepository.findByIds).mockResolvedValue([otherCustomerBillingNote] as never);

    await expect(
      receiptNoteService.createReceiptNote([otherCustomerBillingNote._id.toString()], new Date(), customerId)
    ).rejects.toThrow(NotFoundError);

    expect(receiptNoteRepository.createReceiptNote).not.toHaveBeenCalled();
  });

  it('throws ConflictError when a selected billing note has no documentNumber yet', async () => {
    const billingNote = makeBillingNote({ documentNumber: undefined });
    vi.mocked(billingNoteRepository.findByIds).mockResolvedValue([billingNote] as never);

    await expect(
      receiptNoteService.createReceiptNote([billingNote._id.toString()], new Date(), customerId)
    ).rejects.toThrow(ConflictError);

    expect(receiptNoteRepository.createReceiptNote).not.toHaveBeenCalled();
  });

  it('throws ConflictError when a selected billing note is already attached to another receipt', async () => {
    const billingNote = makeBillingNote();
    vi.mocked(billingNoteRepository.findByIds).mockResolvedValue([billingNote] as never);
    vi.mocked(receiptNoteBillingNoteRepository.listReceiptedBillingNoteIds).mockResolvedValue([billingNote._id]);

    await expect(
      receiptNoteService.createReceiptNote([billingNote._id.toString()], new Date(), customerId)
    ).rejects.toThrow(ConflictError);

    expect(receiptNoteRepository.createReceiptNote).not.toHaveBeenCalled();
  });
});

describe('receiptNoteService.generateReceiptNoteDocument', () => {
  const customer = { _id: customerId, customerName: 'Acme', address: 'addr', billName: 'Acme Billing' };

  it('allocates a running number scoped to the receipt date month, using the supplied date rather than the current date', async () => {
    vi.mocked(customersRepository.findById).mockResolvedValue(customer as never);
    vi.mocked(nextSequence).mockResolvedValue(3);
    vi.mocked(renderHtmlToPdf).mockResolvedValue(Buffer.from('pdf-bytes'));
    vi.mocked(uploadObjectToBucket).mockResolvedValue({} as never);

    const receiptDate = new Date('2026-03-15T12:00:00.000Z');
    const billingNote = makeBillingNote({ totalAmount: 50 });

    const documentNumber = await receiptNoteService.generateReceiptNoteDocument(receiptDate, customerId, [
      billingNote
    ]);

    const expectedMonthBucket = moment(receiptDate).format('YYYY-MM');
    expect(nextSequence).toHaveBeenCalledWith('receiptNotes:' + expectedMonthBucket);
    expect(documentNumber).toBe('RC' + moment(receiptDate).format('YYYYMM') + '03');
    expect(uploadObjectToBucket).toHaveBeenCalledWith(
      correctionDepartmentBucketName,
      `RC/${documentNumber}.pdf`,
      expect.any(Buffer),
      'application/pdf'
    );
  });

  it('reuses a supplied document number instead of allocating a new running number (regenerate-document path)', async () => {
    vi.mocked(customersRepository.findById).mockResolvedValue(customer as never);
    vi.mocked(renderHtmlToPdf).mockResolvedValue(Buffer.from('pdf-bytes'));
    vi.mocked(uploadObjectToBucket).mockResolvedValue({} as never);

    const documentNumber = await receiptNoteService.generateReceiptNoteDocument(
      new Date('2026-03-15T00:00:00.000Z'),
      customerId,
      [makeBillingNote()],
      'RC20260399'
    );

    expect(nextSequence).not.toHaveBeenCalled();
    expect(documentNumber).toBe('RC20260399');
  });

  it('throws NotFoundError when the customer no longer exists', async () => {
    vi.mocked(customersRepository.findById).mockResolvedValue(null);

    await expect(
      receiptNoteService.generateReceiptNoteDocument(new Date(), customerId, [makeBillingNote()])
    ).rejects.toThrow(NotFoundError);
  });
});

describe('receiptNoteService.deleteReceiptNote', () => {
  it('hard-deletes the join rows and the receipt note in a transaction, then deletes the PDF', async () => {
    const receiptNoteId = new Types.ObjectId().toString();
    const receiptNote = { _id: receiptNoteId, documentNumber: 'RC20260101' };
    vi.mocked(receiptNoteRepository.findById).mockResolvedValue(receiptNote as never);

    await receiptNoteService.deleteReceiptNote(receiptNoteId);

    expect(receiptNoteBillingNoteRepository.deleteByReceiptNoteId).toHaveBeenCalledWith(receiptNoteId, undefined);
    expect(receiptNoteRepository.deleteReceiptNote).toHaveBeenCalledWith(receiptNoteId, undefined);
    expect(deleteObjectFromBucket).toHaveBeenCalledWith(correctionDepartmentBucketName, 'RC/RC20260101.pdf');
  });

  it('throws NotFoundError when the receipt note does not exist', async () => {
    vi.mocked(receiptNoteRepository.findById).mockResolvedValue(null);

    await expect(receiptNoteService.deleteReceiptNote('missing-id')).rejects.toThrow(NotFoundError);
    expect(receiptNoteRepository.deleteReceiptNote).not.toHaveBeenCalled();
    expect(deleteObjectFromBucket).not.toHaveBeenCalled();
  });
});
