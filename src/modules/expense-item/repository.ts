import { ConflictError } from '../../shared/errors';
import { ExpenseItemModel } from '../../shared/persistence';
import { ExpenseItem } from '../../shared/types';

const rethrowDuplicate = (error: unknown): never => {
  if ((error as { code?: number })?.code === 11000) {
    throw new ConflictError('รายการนี้มีอยู่แล้ว');
  }
  throw error;
};

export const expenseItemsRepository = {
  async create(itemName: string) {
    try {
      const [doc] = await ExpenseItemModel.create([{ itemName }]);
      return doc.toObject();
    } catch (error) {
      return rethrowDuplicate(error);
    }
  },

  // Presets are few, so the list is unpaged. Thai collation gives ก-ฮ order.
  list() {
    return ExpenseItemModel.find({ deletedAt: null })
      .collation({ locale: 'th' })
      .sort({ itemName: 1 })
      .lean<ExpenseItem[]>();
  },

  async update(_id: string, itemName: string) {
    try {
      return await ExpenseItemModel.findOneAndUpdate(
        { _id, deletedAt: null },
        { $set: { itemName } },
        { returnDocument: 'after', runValidators: true }
      ).lean<ExpenseItem | null>();
    } catch (error) {
      return rethrowDuplicate(error);
    }
  },

  remove(_id: string) {
    return ExpenseItemModel.findOneAndUpdate(
      { _id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'before' }
    ).lean<ExpenseItem | null>();
  }
};
