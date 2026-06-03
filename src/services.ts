import { orderCreditAdapter } from './modules/credit/order-credit.adapter';
import { financeService } from './modules/finance/service';
import { configureOrderPorts, orderService } from './modules/order/service';

configureOrderPorts({ credit: orderCreditAdapter });

export const createOrderWithCredit = orderService.createOrder;
export const applyFinancialTransaction = financeService.applyPayment;
export const replaceFinancialTransaction = financeService.replacePayment;
export const removeFinancialTransaction = financeService.removePayment;

export const removeOrder = async (orderId: string) => {
  const removed = await orderService.removeOrder(orderId);
  return Boolean(removed);
};
