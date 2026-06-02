import { ClientSession } from 'mongoose';
import { runInTransaction } from '../../shared/persistence';
import { financeRepository } from '../finance/repository';
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

  createCreditForOrder(order: {
    id: number;
    customerId: number;
    sellPrice: number;
    status: OrderStatus;
  }, session?: ClientSession) {
    return creditRepository.create({
      orderId: order.id,
      customerId: order.customerId,
      totalAmount: order.sellPrice,
      paidAmount: 0,
      status: order.status === 'cancelled' ? 'cancelled' : 'pending'
    }, session);
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

  async updateCreditFromOrder(
    orderId: number,
    input: { sellPrice?: number; customerId?: number; status?: OrderStatus },
    session?: ClientSession
  ) {
    const credit = await creditRepository.findByOrderId(orderId);
    if (!credit) {
      return undefined;
    }

    return creditRepository.update(credit.id, {
      totalAmount: typeof input.sellPrice === 'number' ? input.sellPrice : credit.totalAmount,
      customerId: typeof input.customerId === 'number' ? input.customerId : credit.customerId,
      status: input.status ? (input.status === 'completed' ? 'paid' : input.status) : credit.status
    }, session);
  },

  async updateCustomerCredit(id: number, input: Partial<Omit<CustomerCredit, 'id'>>, session?: ClientSession) {
    const existing = await creditRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    const credit = await creditRepository.update(id, {
      ...input,
      status: normalizeCreditStatus({ ...existing, ...input, id: existing.id })
    }, session);
    if (!credit) {
      return undefined;
    }

    return credit;
  },

  async adjustPaidAmount(id: number, delta: number, session?: ClientSession) {
    const credit = await creditRepository.findById(id);
    if (!credit) {
      throw new Error('Customer credit not found');
    }

    if (credit.status === 'cancelled' && delta > 0) {
      throw new Error('Cannot pay cancelled customer credit');
    }

    const paidAmount = Math.max(0, credit.paidAmount + delta);
    return creditRepository.update(id, {
      paidAmount,
      status: normalizeCreditStatus({ ...credit, paidAmount })
    }, session);
  },

  removeCustomerCredit(id: number, session?: ClientSession) {
    const run = async (activeSession?: ClientSession) => {
      const removed = await creditRepository.remove(id, activeSession);
      if (!removed) {
        return undefined;
      }

      await financeRepository.removeByCreditId(removed.id, activeSession);
      return removed;
    };

    return session ? run(session) : runInTransaction(run);
  },

  removeCreditsForOrder(orderId: number, session?: ClientSession) {
    return creditRepository.removeByOrderId(orderId, session);
  }
};
