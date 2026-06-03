import { creditService } from './service';
import { OrderCreditPort } from '../order/ports';

export const orderCreditAdapter: OrderCreditPort = {
  createCreditForOrder(order, session) {
    return creditService.createCreditForOrder(order, session);
  },

  getCreditByOrderId(orderId, session) {
    return creditService.getCreditByOrderId(orderId, session);
  },

  removeCreditsForOrder(orderId, session) {
    return creditService.removeCreditsForOrder(orderId, session);
  }
};
