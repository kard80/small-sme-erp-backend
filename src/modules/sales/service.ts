import { creditService, mapOrderStatusFromCredit } from '../credit/service';
import { CreateOrderInput, CreditStatus, OrderStatus } from '../../shared/types';
import { salesRepository } from './repository';

export const salesService = {
  createOrder(input: CreateOrderInput) {
    const order = salesRepository.create(input);
    const credit = creditService.createCreditForOrder(order);
    return { order, credit };
  },

  listOrders(page: number, pageSize: number) {
    return salesRepository.list(page, pageSize);
  },

  getOrder(id: number) {
    return salesRepository.findById(id);
  },

  updateOrder(id: number, input: Partial<CreateOrderInput>) {
    const order = salesRepository.update(id, input);
    if (!order) {
      return undefined;
    }

    creditService.updateCreditFromOrder(order.id, input);
    return order;
  },

  updateOrderStatusFromCredit(orderId: number, status: CreditStatus) {
    const order = salesRepository.findById(orderId);
    if (!order || order.status === 'cancelled') {
      return order;
    }

    order.status = mapOrderStatusFromCredit(status);
    return order;
  },

  setOrderStatus(orderId: number, status: OrderStatus) {
    const order = salesRepository.findById(orderId);
    if (!order) {
      return undefined;
    }

    order.status = status;
    return order;
  },

  removeOrder(id: number) {
    const order = salesRepository.remove(id);
    if (!order) {
      return undefined;
    }

    const credits = creditService.removeCreditsForOrder(order.id);
    return { order, credits };
  }
};
