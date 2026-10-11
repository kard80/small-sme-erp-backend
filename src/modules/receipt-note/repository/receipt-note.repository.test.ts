import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptNoteModel } from '../schema';
import { receiptNoteRepository } from './receipt-note.repository';
import { Pagination } from '../../../shared/pagination';

afterEach(() => vi.restoreAllMocks());

const stubModel = () => {
  const cursor: any = {
    sort: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    lean: vi.fn(async () => [])
  };
  vi.spyOn(ReceiptNoteModel, 'find').mockReturnValue(cursor);
  vi.spyOn(ReceiptNoteModel, 'countDocuments').mockResolvedValue(0 as never);
  return cursor;
};

describe('receiptNoteRepository.list', () => {
  it('sorts by receiptDate descending, newest first', async () => {
    const cursor = stubModel();
    await receiptNoteRepository.list(new Date(0), new Date());
    expect(cursor.sort).toHaveBeenCalledWith({ receiptDate: -1, _id: -1 });
  });

  it('filters by customer and the date range, excluding deleted', async () => {
    stubModel();
    await receiptNoteRepository.list(new Date(0), new Date(5), 'c1');
    expect(ReceiptNoteModel.find).toHaveBeenCalledWith({
      deletedAt: null,
      customerId: 'c1',
      receiptDate: { $gte: new Date(0), $lte: new Date(5) }
    });
  });

  it('applies skip/limit only when paginated', async () => {
    const cursor = stubModel();
    await receiptNoteRepository.list(new Date(0), new Date());
    expect(cursor.skip).not.toHaveBeenCalled();
    await receiptNoteRepository.list(new Date(0), new Date(), undefined, new Pagination(2, 5));
    expect(cursor.skip).toHaveBeenCalledWith(5);
  });
});
