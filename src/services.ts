import { financeService } from './modules/finance/service';
import { salesService } from './modules/sales/service';
import { mapOrderStatusFromCredit } from './modules/credit/service';

export const createOrderWithCredit = salesService.createOrder;
export const applyFinancialTransaction = financeService.applyPayment;
export const replaceFinancialTransaction = financeService.replacePayment;
export const removeFinancialTransaction = financeService.removePayment;
export { mapOrderStatusFromCredit };

export const removeOrder = async (orderId: number) => {
  const removed = await salesService.removeOrder(orderId);
  return Boolean(removed);
};
