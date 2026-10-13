import { ClientSession } from 'mongoose';
import { ExpenseModel } from '../../shared/persistence';
import { EntityPatch, Expense, NewEntity } from '../../shared/types';

// Whitelisted fields only. '' means "absent" on create.
const toCreateDoc = (input: NewEntity<Expense, never>) => ({
  item: input.item,
  amount: input.amount,
  expenseDate: input.expenseDate,
  ...(input.note && { note: input.note })
});

// '' unsets note; undefined leaves a field untouched.
const toUpdateOps = (input: EntityPatch<Expense, never>) => {
  const $set: Record<string, unknown> = {};
  if (input.item !== undefined) $set.item = input.item;
  if (input.amount !== undefined) $set.amount = input.amount;
  if (input.expenseDate !== undefined) $set.expenseDate = input.expenseDate;
  if (input.note) $set.note = input.note;
  return { ...(Object.keys($set).length && { $set }), ...(input.note === '' && { $unset: { note: 1 } }) };
};

export const expensesRepository = {
  async create(input: NewEntity<Expense, never>, session?: ClientSession) {
    const [expense] = await ExpenseModel.create([toCreateDoc(input)], { session });
    return expense.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      ExpenseModel.find({ deletedAt: null })
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Expense[]>(),
      ExpenseModel.countDocuments({ deletedAt: null })
    ]);

    return { data, page, pageSize, total };
  },

  // expenseDate is stored at UTC midnight, so YYYY-MM-DD bounds compare exactly.
  async summary(startDate?: string, endDate?: string) {
    const range = {
      ...(startDate && { $gte: new Date(`${startDate}T00:00:00.000Z`) }),
      ...(endDate && { $lte: new Date(`${endDate}T00:00:00.000Z`) })
    };
    const byItem = await ExpenseModel.aggregate<{ item: string; total: number }>([
      { $match: { deletedAt: null, ...(Object.keys(range).length && { expenseDate: range }) } },
      { $group: { _id: '$item', total: { $sum: '$amount' } } },
      { $project: { _id: 0, item: '$_id', total: 1 } },
      { $sort: { total: -1, item: 1 } }
    ]);
    return byItem;
  },

  findById(_id: string, session?: ClientSession) {
    return ExpenseModel.findOne({ _id, deletedAt: null }).session(session ?? null).lean<Expense | null>();
  },

  update(_id: string, input: EntityPatch<Expense, never>, session?: ClientSession) {
    return ExpenseModel.findOneAndUpdate({ _id, deletedAt: null }, toUpdateOps(input), {
      returnDocument: 'after',
      runValidators: true
    }).session(session ?? null).lean<Expense | null>();
  },

  remove(_id: string, session?: ClientSession) {
    return ExpenseModel.findOneAndUpdate(
      { _id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'before' }
    ).session(session ?? null).lean<Expense | null>();
  }
};
