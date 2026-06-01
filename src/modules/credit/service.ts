import { CreditStatus, CustomerCredit, OrderStatus } from '../../shared/types';
import { creditRepository } from './repository';

export const normalizeCreditStatus = (credit: CustomerCredit): CreditStatus => {
  if (credit.status === 'cancelled') {
    return 'cancelled';
  }

  return credit.paidAmount >= credit.totalAmount ? 'paid' : 'pending';
};

export const mapOrderStatusFromCredit = (status: CreditStatus): OrderStatus => {
  if (status === 'cancelled') {
    return 'cancelled';
  }

  return status === 'paid' ? 'completed' : 'pending';
};

export const creditService = {
  createCustomerCredit(input: Omit<CustomerCredit, 'id'>) {
    return creditRepository.create(input);
  },

  createCreditForOrder(order: { id: number; customerId: number; sellPrice: number; status: OrderStatus }) {
    return creditRepository.create({
      orderId: order.id,
      customerId: order.customerId,
      totalAmount: order.sellPrice,
      paidAmount: 0,
      status: order.status === 'cancelled' ? 'cancelled' : 'pending'
    });
  },

  listCustomerCredits() {
    return creditRepository.list();
  },

  getCustomerCredit(id: number) {
    return creditRepository.findById(id);
  },

  getCreditByOrderId(orderId: number) {
    return creditRepository.findByOrderId(orderId);
  },

  updateCreditFromOrder(orderId: number, input: { sellPrice?: number; customerId?: number; status?: OrderStatus }) {
    const credit = creditRepository.findByOrderId(orderId);
    if (!credit) {
      return undefined;
    }

    if (typeof input.sellPrice === 'number') {
      credit.totalAmount = input.sellPrice;
    }
    if (typeof input.customerId === 'number') {
      credit.customerId = input.customerId;
    }
    if (input.status) {
      credit.status = input.status === 'completed' ? 'paid' : input.status;
    }

    return credit;
  },

  updateCustomerCredit(id: number, input: Partial<Omit<CustomerCredit, 'id'>>) {
    const credit = creditRepository.update(id, input);
    if (!credit) {
      return undefined;
    }

    credit.status = normalizeCreditStatus(credit);
    return credit;
  },

  adjustPaidAmount(id: number, delta: number) {
    const credit = creditRepository.findById(id);
    if (!credit) {
      throw new Error('Customer credit not found');
    }

    if (credit.status === 'cancelled' && delta > 0) {
      throw new Error('Cannot pay cancelled customer credit');
    }

    credit.paidAmount += delta;
    if (credit.paidAmount < 0) {
      credit.paidAmount = 0;
    }
    credit.status = normalizeCreditStatus(credit);
    return credit;
  },

  removeCustomerCredit(id: number) {
    return creditRepository.remove(id);
  },

  removeCreditsForOrder(orderId: number) {
    return creditRepository.removeByOrderId(orderId);
  }
};
