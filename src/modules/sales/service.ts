import { ClientSession } from 'mongoose';
import { creditService, mapOrderStatusFromCredit } from '../credit/service';
import { financeRepository } from '../finance/repository';
import { CreateOrderInput, CreditStatus, OrderStatus } from '../../shared/types';
import { runInTransaction } from '../../shared/persistence';
import { salesRepository } from './repository';

export const salesService = {
  createOrder(input: CreateOrderInput) {
    return runInTransaction(async (session) => {
      const order = await salesRepository.create(input, session);
      const credit = await creditService.createCreditForOrder(order, session);
      return { order, credit };
    });
  },

  listOrders(page: number, pageSize: number) {
    return salesRepository.list(page, pageSize);
  },

  getOrder(id: number) {
    return salesRepository.findById(id);
  },

  async updateOrder(id: number, input: Partial<CreateOrderInput>, session?: ClientSession) {
    const run = async (activeSession?: ClientSession) => {
      const order = await salesRepository.update(id, input, activeSession);
      if (!order) {
        return undefined;
      }

      await creditService.updateCreditFromOrder(order.id, input, activeSession);
      return order;
    };

    return session ? run(session) : runInTransaction(run);
  },

  async updateOrderStatusFromCredit(orderId: number, status: CreditStatus, session?: ClientSession) {
    const order = await salesRepository.findById(orderId);
    if (!order || order.status === 'cancelled') {
      return order;
    }

    return salesRepository.update(orderId, { status: mapOrderStatusFromCredit(status) }, session);
  },

  setOrderStatus(orderId: number, status: OrderStatus, session?: ClientSession) {
    return salesRepository.update(orderId, { status }, session);
  },

  removeOrder(id: number) {
    return runInTransaction(async (session) => {
      const order = await salesRepository.remove(id, session);
      if (!order) {
        return undefined;
      }

      const credits = await creditService.removeCreditsForOrder(order.id, session);
      await Promise.all(credits.map((credit) => financeRepository.removeByCreditId(credit.id, session)));
      return { order, credits };
    });
  }
};
