import { orderService } from './modules/order/service';

export const createOrder = orderService.createOrder;

export const removeOrder = async (orderId: string) => {
  const removed = await orderService.removeOrder(orderId);
  return Boolean(removed);
};
