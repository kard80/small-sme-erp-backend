import { ClientSession } from 'mongoose';
import { creditService, mapOrderStatusFromCredit } from '../credit/service';
import { financeRepository } from '../finance/repository';
import { CreateOrderInput, CreditStatus, OrderStatus } from '../../shared/types';
import { runInTransaction } from '../../shared/persistence';
import { orderRepository } from './repository';

export const orderService = {
  createOrder(input: CreateOrderInput) {
    return runInTransaction(async (session) => {
      const order = await orderRepository.create(input, session);
      const credit = await creditService.createCreditForOrder(order, session);
      return { order, credit };
    });
  },

  listOrders(page: number, pageSize: number) {
    return orderRepository.list(page, pageSize);
  },

  getOrder(id: number) {
    return orderRepository.findById(id);
  },

  async updateOrder(id: number, input: Partial<CreateOrderInput>, session?: ClientSession) {
    const run = async (activeSession?: ClientSession) => {
      const order = await orderRepository.update(id, input, activeSession);
      if (!order) {
        return undefined;
      }

      await creditService.updateCreditFromOrder(order.id, input, activeSession);
      return order;
    };

    return session ? run(session) : runInTransaction(run);
  },

  async updateOrderStatusFromCredit(orderId: number, status: CreditStatus, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order || order.status === 'cancelled') {
      return order;
    }

    return orderRepository.update(orderId, { status: mapOrderStatusFromCredit(status) }, session);
  },

  async resetOrderStatusAfterCreditRemoval(orderId: number, session?: ClientSession) {
    const order = await orderRepository.findById(orderId, session);
    if (!order) {
      return undefined;
    }
    if (order.status === 'cancelled') {
      return order;
    }

    return orderRepository.update(orderId, { status: 'pending' }, session);
  },

  setOrderStatus(orderId: number, status: OrderStatus, session?: ClientSession) {
    return orderRepository.update(orderId, { status }, session);
  },

  removeOrder(id: number) {
    return runInTransaction(async (session) => {
      const order = await orderRepository.remove(id, session);
      if (!order) {
        return undefined;
      }

      const credits = await creditService.removeCreditsForOrder(order.id, session);
      await Promise.all(credits.map((credit) => financeRepository.removeByCreditId(credit.id, session)));
      return { order, credits };
    });
  }
};
