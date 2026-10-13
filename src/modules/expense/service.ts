import { expensesRepository } from './repository';

export const expenseService = {
  createExpense(input: Parameters<typeof expensesRepository.create>[0]) {
    return expensesRepository.create(input);
  },

  listExpenses(page: number, pageSize: number, startDate?: string, endDate?: string) {
    return expensesRepository.list(page, pageSize, startDate, endDate);
  },

  async getSummary(startDate?: string, endDate?: string) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const byItem = (await expensesRepository.summary(startDate, endDate)).map((r) => ({ item: r.item, total: round2(r.total) }));
    return { total: round2(byItem.reduce((sum, r) => sum + r.total, 0)), byItem };
  },

  getExpense(_id: string) {
    return expensesRepository.findById(_id);
  },

  updateExpense(_id: string, input: Parameters<typeof expensesRepository.update>[1]) {
    return expensesRepository.update(_id, input);
  },

  removeExpense(_id: string) {
    return expensesRepository.remove(_id);
  }
};
