import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingNoteModel } from '../schema';
import { billingNoteRepository } from './billing-note.repository';
import { Pagination } from '../../../shared/pagination';

afterEach(() => vi.restoreAllMocks());

const stubModel = () => {
  const cursor: any = {
    sort: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    lean: vi.fn(async () => [])
  };
  vi.spyOn(BillingNoteModel, 'find').mockReturnValue(cursor);
  vi.spyOn(BillingNoteModel, 'countDocuments').mockResolvedValue(0 as never);
  return cursor;
};

describe('billingNoteRepository.list', () => {
  it('sorts by issuedDate descending, newest first', async () => {
    const cursor = stubModel();
    await billingNoteRepository.list(new Date(0), new Date());
    expect(cursor.sort).toHaveBeenCalledWith({ issuedDate: -1, _id: -1 });
  });

  it('filters by customer and the date range, excluding deleted', async () => {
    stubModel();
    await billingNoteRepository.list(new Date(0), new Date(5), 'c1');
    expect(BillingNoteModel.find).toHaveBeenCalledWith({
      deletedAt: null,
      customerId: 'c1',
      issuedDate: { $gte: new Date(0), $lte: new Date(5) }
    });
  });

  it('applies skip/limit only when paginated', async () => {
    const cursor = stubModel();
    await billingNoteRepository.list(new Date(0), new Date());
    expect(cursor.skip).not.toHaveBeenCalled();
    await billingNoteRepository.list(new Date(0), new Date(), undefined, new Pagination(2, 5));
    expect(cursor.skip).toHaveBeenCalledWith(5);
  });
});
