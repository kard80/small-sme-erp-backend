import { ClientSession } from 'mongoose';
import { creditService } from '../credit/service';
import { salesService } from '../sales/service';
import { runInTransaction } from '../../shared/persistence';
import { PaymentTransaction } from '../../shared/types';
import { financeRepository } from './repository';

const syncOrderFromCredit = async (customerCreditId: number, session?: ClientSession) => {
  const credit = await creditService.getCustomerCredit(customerCreditId);
  if (credit) {
    await salesService.updateOrderStatusFromCredit(credit.orderId, credit.status, session);
  }
};

export const financeService = {
  applyPayment(input: Omit<PaymentTransaction, 'id'>) {
    return runInTransaction(async (session) => {
      const credit = await creditService.getCustomerCredit(input.customerCreditId);
      if (!credit) {
        throw new Error('Customer credit not found');
      }
      if (credit.status === 'cancelled') {
        throw new Error('Cannot pay cancelled customer credit');
      }

      const payment = await financeRepository.create(input, session);
      await creditService.adjustPaidAmount(payment.customerCreditId, payment.amount, session);
      await syncOrderFromCredit(payment.customerCreditId, session);
      return payment;
    });
  },

  listPayments() {
    return financeRepository.list();
  },

  getPayment(id: number) {
    return financeRepository.findById(id);
  },

  replacePayment(id: number, nextInput: Omit<PaymentTransaction, 'id'>) {
    return runInTransaction(async (session) => {
      const previous = await financeRepository.findById(id);
      if (!previous) {
        throw new Error('Financial transaction not found');
      }

      const nextCredit = await creditService.getCustomerCredit(nextInput.customerCreditId);
      if (!nextCredit) {
        throw new Error('Customer credit not found');
      }
      if (nextCredit.status === 'cancelled') {
        throw new Error('Cannot pay cancelled customer credit');
      }

      await creditService.adjustPaidAmount(previous.customerCreditId, -previous.amount, session);
      await syncOrderFromCredit(previous.customerCreditId, session);

      const updated = await financeRepository.update(id, nextInput, session);
      if (!updated) {
        throw new Error('Financial transaction not found');
      }

      await creditService.adjustPaidAmount(updated.customerCreditId, updated.amount, session);
      await syncOrderFromCredit(updated.customerCreditId, session);
      return updated;
    });
  },

  removePayment(id: number) {
    return runInTransaction(async (session) => {
      const removed = await financeRepository.remove(id, session);
      if (!removed) {
        return false;
      }

      await creditService.adjustPaidAmount(removed.customerCreditId, -removed.amount, session);
      await syncOrderFromCredit(removed.customerCreditId, session);
      return true;
    });
  },

  removePaymentsForCredit(customerCreditId: number, session?: ClientSession) {
    return financeRepository.removeByCreditId(customerCreditId, session);
  }
};
