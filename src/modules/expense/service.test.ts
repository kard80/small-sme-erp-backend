import { describe, expect, it, vi } from 'vitest';

vi.mock('./repository', () => ({
  expensesRepository: { create: vi.fn(), list: vi.fn(), findById: vi.fn(), summary: vi.fn(), update: vi.fn(), remove: vi.fn() }
}));

import { expensesRepository } from './repository';
import { expenseService } from './service';

describe('expenseService', () => {
  it('delegates to the repository', async () => {
    vi.mocked(expensesRepository.list).mockResolvedValue({ data: [] } as any);
    await expenseService.listExpenses(2, 5);
    expect(expensesRepository.list).toHaveBeenCalledWith(2, 5, undefined, undefined);
    await expenseService.getExpense('i');
    expect(expensesRepository.findById).toHaveBeenCalledWith('i');
    await expenseService.updateExpense('i', { amount: 1 });
    expect(expensesRepository.update).toHaveBeenCalledWith('i', { amount: 1 });
    await expenseService.removeExpense('i');
    expect(expensesRepository.remove).toHaveBeenCalledWith('i');
  });

  it('getSummary rounds item totals and sums them', async () => {
    vi.mocked(expensesRepository.summary).mockResolvedValue([
      { item: 'ค่าไฟ', total: 10.005 },
      { item: 'ค่าน้ำ', total: 5.1 }
    ]);
    expect(await expenseService.getSummary('2026-01-01', '2026-01-31')).toEqual({
      total: 15.11,
      byItem: [
        { item: 'ค่าไฟ', total: 10.01 },
        { item: 'ค่าน้ำ', total: 5.1 }
      ]
    });
  });
});
