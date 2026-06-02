import { ClientSession } from 'mongoose';
import { runInTransaction } from '../../shared/persistence';
import { financeRepository } from '../finance/repository';
import { CreditStatus, CustomerCredit, EntityPatch, NewEntity, OrderStatus } from '../../shared/types';
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
  createCustomerCredit(input: NewEntity<CustomerCredit, 'id'>) {
    return creditRepository.create(input);
  },

  createCreditForOrder(order: {
    id: number;
    customerId: number;
    sellPrice: number;
    status: OrderStatus;
  }, session?: ClientSession) {
    const status: CreditStatus =
      order.status === 'cancelled' ? 'cancelled' : order.status === 'completed' ? 'paid' : 'pending';
    const paidAmount = status === 'paid' ? order.sellPrice : 0;
    return creditRepository.create({
      orderId: order.id,
      customerId: order.customerId,
      totalAmount: order.sellPrice,
      paidAmount,
      status
    }, session);
  },

  listCustomerCredits() {
    return creditRepository.list();
  },

  getCustomerCredit(id: number, session?: ClientSession) {
    return creditRepository.findById(id, session);
  },

  getCreditByOrderId(orderId: number, session?: ClientSession) {
    return creditRepository.findByOrderId(orderId, session);
  },

  async updateCreditFromOrder(
    orderId: number,
    input: { sellPrice?: number; customerId?: number; status?: OrderStatus },
    session?: ClientSession
  ) {
    const credit = await creditRepository.findByOrderId(orderId, session);
    if (!credit) {
      return undefined;
    }

    const totalAmount = typeof input.sellPrice === 'number' ? input.sellPrice : credit.totalAmount;
    const paidAmount = input.status === 'completed' ? totalAmount : Math.min(credit.paidAmount, totalAmount);
    const status =
      input.status === 'completed'
        ? 'paid'
        : input.status === 'cancelled'
          ? 'cancelled'
          : normalizeCreditStatus({ ...credit, totalAmount, paidAmount, status: credit.status });

    return creditRepository.update(credit.id, {
      totalAmount,
      paidAmount,
      customerId: typeof input.customerId === 'number' ? input.customerId : credit.customerId,
      status
    }, session);
  },

  async updateCustomerCredit(id: number, input: EntityPatch<CustomerCredit, 'id'>, session?: ClientSession) {
    const existing = await creditRepository.findById(id, session);
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
    const credit = await creditRepository.findById(id, session);
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
