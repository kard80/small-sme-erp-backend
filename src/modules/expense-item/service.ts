import { expenseItemsRepository } from './repository';

export const expenseItemService = {
  createExpenseItem: (itemName: string) => expenseItemsRepository.create(itemName),
  listExpenseItems: () => expenseItemsRepository.list(),
  updateExpenseItem: (_id: string, itemName: string) => expenseItemsRepository.update(_id, itemName),
  removeExpenseItem: (_id: string) => expenseItemsRepository.remove(_id)
};
