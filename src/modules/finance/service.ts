import { creditService } from '../credit/service';
import { salesService } from '../sales/service';
import { PaymentTransaction } from '../../shared/types';
import { financeRepository } from './repository';

const syncOrderFromCredit = (customerCreditId: number) => {
  const credit = creditService.getCustomerCredit(customerCreditId);
  if (credit) {
    salesService.updateOrderStatusFromCredit(credit.orderId, credit.status);
  }
};

export const financeService = {
  applyPayment(input: Omit<PaymentTransaction, 'id'>) {
    const credit = creditService.getCustomerCredit(input.customerCreditId);
    if (!credit) {
      throw new Error('Customer credit not found');
    }
    if (credit.status === 'cancelled') {
      throw new Error('Cannot pay cancelled customer credit');
    }

    const payment = financeRepository.create(input);
    creditService.adjustPaidAmount(payment.customerCreditId, payment.amount);
    syncOrderFromCredit(payment.customerCreditId);
    return payment;
  },

  listPayments() {
    return financeRepository.list();
  },

  getPayment(id: number) {
    return financeRepository.findById(id);
  },

  replacePayment(id: number, nextInput: Omit<PaymentTransaction, 'id'>) {
    const previous = financeRepository.findById(id);
    if (!previous) {
      throw new Error('Financial transaction not found');
    }

    const nextCredit = creditService.getCustomerCredit(nextInput.customerCreditId);
    if (!nextCredit) {
      throw new Error('Customer credit not found');
    }
    if (nextCredit.status === 'cancelled') {
      throw new Error('Cannot pay cancelled customer credit');
    }

    creditService.adjustPaidAmount(previous.customerCreditId, -previous.amount);
    syncOrderFromCredit(previous.customerCreditId);

    const updated = financeRepository.update(id, nextInput);
    if (!updated) {
      throw new Error('Financial transaction not found');
    }

    creditService.adjustPaidAmount(updated.customerCreditId, updated.amount);
    syncOrderFromCredit(updated.customerCreditId);
    return updated;
  },

  removePayment(id: number) {
    const removed = financeRepository.remove(id);
    if (!removed) {
      return false;
    }

    creditService.adjustPaidAmount(removed.customerCreditId, -removed.amount);
    syncOrderFromCredit(removed.customerCreditId);
    return true;
  },

  removePaymentsForCredit(customerCreditId: number) {
    financeRepository.removeByCreditId(customerCreditId);
  }
};
