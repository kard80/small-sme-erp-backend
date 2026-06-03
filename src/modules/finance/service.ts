import { ClientSession } from 'mongoose';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { creditService } from '../credit/service';
import { orderService } from '../order/service';
import { runInTransaction } from '../../shared/persistence';
import { NewEntity, PaymentTransaction } from '../../shared/types';
import { financeRepository } from './repository';

const syncOrderFromCredit = async (customerCreditId: string, session?: ClientSession) => {
  const credit = await creditService.getCustomerCredit(customerCreditId, session);
  if (credit) {
    await orderService.updateOrderStatusFromCredit(credit.orderId.toString(), credit.status, session);
  }
};

export const financeService = {
  applyPayment(input: NewEntity<PaymentTransaction, never>) {
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

  getPayment(_id: string) {
    return financeRepository.findById(_id);
  },

  replacePayment(_id: string, nextInput: NewEntity<PaymentTransaction, never>) {
    return runInTransaction(async (session) => {
      const previous = await financeRepository.findById(_id, session);
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

      const updated = await financeRepository.update(_id, nextInput, session);
      if (!updated) {
        throw new NotFoundError('ไม่พบธุรกรรมการเงิน');
      }

      await creditService.adjustPaidAmount(updated.customerCreditId, updated.amount, session);
      await syncOrderFromCredit(updated.customerCreditId, session);
      return updated;
    });
  },

  removePayment(_id: string) {
    return runInTransaction(async (session) => {
      const removed = await financeRepository.remove(_id, session);
      if (!removed) {
        return false;
      }

      await creditService.adjustPaidAmount(removed.customerCreditId, -removed.amount, session);
      await syncOrderFromCredit(removed.customerCreditId, session);
      return true;
    });
  },

  removePaymentsForCredit(customerCreditId: string, session?: ClientSession) {
    return financeRepository.removeByCreditId(customerCreditId, session);
  }
};
