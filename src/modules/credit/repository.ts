import { db, nextCreditId } from '../../shared/store';
import { CustomerCredit } from '../../shared/types';

export const creditRepository = {
  create(input: Omit<CustomerCredit, 'id'>) {
    const credit = { id: nextCreditId(), ...input };
    db.customerCredits.push(credit);
    return credit;
  },

  list() {
    return db.customerCredits;
  },

  findById(id: number) {
    return db.customerCredits.find((item) => item.id === id);
  },

  findByOrderId(orderId: number) {
    return db.customerCredits.find((item) => item.orderId === orderId);
  },

  listByOrderId(orderId: number) {
    return db.customerCredits.filter((item) => item.orderId === orderId);
  },

  update(id: number, input: Partial<Omit<CustomerCredit, 'id'>>) {
    const credit = this.findById(id);
    if (!credit) {
      return undefined;
    }

    Object.assign(credit, input);
    return credit;
  },

  remove(id: number) {
    const idx = db.customerCredits.findIndex((item) => item.id === id);
    if (idx < 0) {
      return undefined;
    }

    const [removed] = db.customerCredits.splice(idx, 1);
    return removed;
  },

  removeByOrderId(orderId: number) {
    const removed = this.listByOrderId(orderId);
    db.customerCredits = db.customerCredits.filter((item) => item.orderId !== orderId);
    return removed;
  }
};
