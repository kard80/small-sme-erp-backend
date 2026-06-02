import { financeService } from './modules/finance/service';
import { orderService } from './modules/order/service';
import { mapOrderStatusFromCredit } from './modules/credit/service';

export const createOrderWithCredit = orderService.createOrder;
export const applyFinancialTransaction = financeService.applyPayment;
export const replaceFinancialTransaction = financeService.replacePayment;
export const removeFinancialTransaction = financeService.removePayment;
export { mapOrderStatusFromCredit };

export const removeOrder = async (orderId: number) => {
  const removed = await orderService.removeOrder(orderId);
  return Boolean(removed);
};
