import { db, nextFinancialId } from '../../shared/store';
import { PaymentTransaction } from '../../shared/types';

export const financeRepository = {
  create(input: Omit<PaymentTransaction, 'id'>) {
    const payment = { id: nextFinancialId(), ...input };
    db.financials.push(payment);
    return payment;
  },

  list() {
    return db.financials;
  },

  findById(id: number) {
    return db.financials.find((item) => item.id === id);
  },

  update(id: number, input: Omit<PaymentTransaction, 'id'>) {
    const idx = db.financials.findIndex((item) => item.id === id);
    if (idx < 0) {
      return undefined;
    }

    const updated = { id, ...input };
    db.financials[idx] = updated;
    return updated;
  },

  remove(id: number) {
    const idx = db.financials.findIndex((item) => item.id === id);
    if (idx < 0) {
      return undefined;
    }

    const [removed] = db.financials.splice(idx, 1);
    return removed;
  },

  removeByCreditId(customerCreditId: number) {
    db.financials = db.financials.filter((tx) => tx.customerCreditId !== customerCreditId);
  }
};
