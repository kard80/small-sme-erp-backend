import { ClientSession } from 'mongoose';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { creditService } from '../credit/service';
import { orderService } from '../order/service';
import { runInTransaction } from '../../shared/persistence';
import { NewEntity, PaymentTransaction } from '../../shared/types';
import { financeRepository } from './repository';

const syncOrderFromCredit = async (customerCreditId: number, session?: ClientSession) => {
  const credit = await creditService.getCustomerCredit(customerCreditId, session);
  if (credit) {
    await orderService.updateOrderStatusFromCredit(credit.orderId, credit.status, session);
  }
};

export const financeService = {
  applyPayment(input: NewEntity<PaymentTransaction, 'id'>) {
    return runInTransaction(async (session) => {
      const credit = await creditService.getCustomerCredit(input.customerCreditId, session);
      if (!credit) {
        throw new NotFoundError('ไม่พบเครดิตลูกค้า');
      }
      if (credit.status === 'cancelled') {
        throw new BadRequestError('ไม่สามารถชำระเครดิตลูกค้าที่ถูกยกเลิกได้');
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

  replacePayment(id: number, nextInput: NewEntity<PaymentTransaction, 'id'>) {
    return runInTransaction(async (session) => {
      const previous = await financeRepository.findById(id, session);
      if (!previous) {
        throw new NotFoundError('ไม่พบธุรกรรมการเงิน');
      }

      const nextCredit = await creditService.getCustomerCredit(nextInput.customerCreditId, session);
      if (!nextCredit) {
        throw new NotFoundError('ไม่พบเครดิตลูกค้า');
      }
      if (nextCredit.status === 'cancelled') {
        throw new BadRequestError('ไม่สามารถชำระเครดิตลูกค้าที่ถูกยกเลิกได้');
      }

      await creditService.adjustPaidAmount(previous.customerCreditId, -previous.amount, session);
      await syncOrderFromCredit(previous.customerCreditId, session);

      const updated = await financeRepository.update(id, nextInput, session);
      if (!updated) {
        throw new NotFoundError('ไม่พบธุรกรรมการเงิน');
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
