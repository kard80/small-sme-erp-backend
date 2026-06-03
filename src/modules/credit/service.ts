import { ClientSession } from 'mongoose';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { runInTransaction } from '../../shared/persistence';
import { financeRepository } from '../finance/repository';
import { CreditStatus, CustomerCredit, EntityPatch, NewEntity } from '../../shared/types';
import { creditRepository } from './repository';

export const normalizeCreditStatus = (credit: CustomerCredit): CreditStatus => {
  if (credit.status === 'cancelled') {
    return 'cancelled';
  }

  return credit.paidAmount >= credit.totalAmount ? 'paid' : 'pending';
};

export const creditService = {
  createCustomerCredit(input: NewEntity<CustomerCredit, never>) {
    return creditRepository.create(input);
  },

  createCreditForOrder(order: {
    _id: { toString(): string };
    customerId: string;
    totalAmount: number;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
  }, session?: ClientSession) {
    const status: CreditStatus = order.cancelledAt ? 'cancelled' : order.completedAt ? 'paid' : 'pending';
    const paidAmount = status === 'paid' ? order.totalAmount : 0;
    return creditRepository.create({
      orderId: order._id.toString(),
      customerId: order.customerId,
      totalAmount: order.totalAmount,
      paidAmount,
      status
    }, session);
  },

  listCustomerCredits() {
    return creditRepository.list();
  },

  getCustomerCredit(_id: string, session?: ClientSession) {
    return creditRepository.findById(_id, session);
  },

  getCreditByOrderId(orderId: string, session?: ClientSession) {
    return creditRepository.findByOrderId(orderId, session);
  },

  async updateCreditFromOrder(
    orderId: string,
    input: { sellPrice?: number; customerId?: string; completedAt?: string | null; cancelledAt?: string | null },
    session?: ClientSession
  ) {
    const credit = await creditRepository.findByOrderId(orderId, session);
    if (!credit) {
      return undefined;
    }

    const totalAmount = typeof input.sellPrice === 'number' ? input.sellPrice : credit.totalAmount;
    const paidAmount = input.completedAt ? totalAmount : Math.min(credit.paidAmount, totalAmount);
    const status =
      input.completedAt
        ? 'paid'
        : input.cancelledAt
          ? 'cancelled'
          : normalizeCreditStatus({ ...credit, totalAmount, paidAmount, status: credit.status });

    return creditRepository.update(credit._id.toString(), {
      totalAmount,
      paidAmount,
      customerId: typeof input.customerId === 'string' ? input.customerId : credit.customerId,
      status
    }, session);
  },

  async updateCustomerCredit(_id: string, input: EntityPatch<CustomerCredit, never>, session?: ClientSession) {
    const existing = await creditRepository.findById(_id, session);
    if (!existing) {
      return undefined;
    }

    const credit = await creditRepository.update(
      _id,
      {
        ...input,
        status: normalizeCreditStatus({ ...existing, ...input })
      },
      session
    );
    if (!credit) {
      return undefined;
    }

    return credit;
  },

  async adjustPaidAmount(_id: string, delta: number, session?: ClientSession) {
    const credit = await creditRepository.findById(_id, session);
    if (!credit) {
      throw new NotFoundError('ไม่พบเครดิตลูกค้า');
    }

    if (credit.status === 'cancelled' && delta > 0) {
      throw new BadRequestError('ไม่สามารถชำระเครดิตลูกค้าที่ถูกยกเลิกได้');
    }

    const paidAmount = Math.max(0, credit.paidAmount + delta);
    return creditRepository.update(_id, {
      paidAmount,
      status: normalizeCreditStatus({ ...credit, paidAmount })
    }, session);
  },

  removeCustomerCredit(_id: string, session?: ClientSession) {
    const run = async (activeSession?: ClientSession) => {
      const removed = await creditRepository.remove(_id, activeSession);
      if (!removed) {
        return undefined;
      }

      await financeRepository.removeByCreditId(removed._id.toString(), activeSession);
      return removed;
    };

    return session ? run(session) : runInTransaction(run);
  },

  removeCreditsForOrder(orderId: string, session?: ClientSession) {
    return creditRepository.removeByOrderId(orderId, session);
  }
};
