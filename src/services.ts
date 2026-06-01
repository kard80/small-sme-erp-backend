import { db, nextCreditId, nextFinancialId, nextOrderId } from './store';
import { CreateOrderInput, CustomerCredit, CreditStatus, FinancialTransaction, OrderStatus } from './types';

const normalizeCreditStatus = (credit: CustomerCredit): CreditStatus => {
  if (credit.status === 'cancelled') {
    return 'cancelled';
  }
  return credit.paidAmount >= credit.totalAmount ? 'paid' : 'pending';
};

export const createOrderWithCredit = (input: CreateOrderInput) => {
  const order = { id: nextOrderId(), ...input };
  db.orders.push(order);

  const credit: CustomerCredit = {
    id: nextCreditId(),
    orderId: order.id,
    customerId: order.customerId,
    totalAmount: order.sellPrice,
    paidAmount: 0,
    status: order.status === 'cancelled' ? 'cancelled' : 'pending'
  };
  db.customerCredits.push(credit);

  return { order, credit };
};

export const applyFinancialTransaction = (input: Omit<FinancialTransaction, 'id'>) => {
  const credit = db.customerCredits.find((item) => item.id === input.customerCreditId);
  if (!credit) {
    throw new Error('Customer credit not found');
  }

  if (credit.status === 'cancelled') {
    throw new Error('Cannot pay cancelled customer credit');
  }

  const tx: FinancialTransaction = { id: nextFinancialId(), ...input };
  db.financials.push(tx);
  credit.paidAmount += tx.amount;
  credit.status = normalizeCreditStatus(credit);

  const order = db.orders.find((item) => item.id === credit.orderId);
  if (order && order.status !== 'cancelled') {
    order.status = credit.status === 'paid' ? 'completed' : 'pending';
  }

  return tx;
};

export const replaceFinancialTransaction = (id: number, nextInput: Omit<FinancialTransaction, 'id'>) => {
  const idx = db.financials.findIndex((item) => item.id === id);
  if (idx < 0) {
    throw new Error('Financial transaction not found');
  }

  const previous = db.financials[idx];
  const previousCredit = db.customerCredits.find((item) => item.id === previous.customerCreditId);
  const nextCredit = db.customerCredits.find((item) => item.id === nextInput.customerCreditId);

  if (!nextCredit) {
    throw new Error('Customer credit not found');
  }

  if (previousCredit) {
    previousCredit.paidAmount -= previous.amount;
    if (previousCredit.paidAmount < 0) {
      previousCredit.paidAmount = 0;
    }
    previousCredit.status = normalizeCreditStatus(previousCredit);
    const previousOrder = db.orders.find((item) => item.id === previousCredit.orderId);
    if (previousOrder && previousOrder.status !== 'cancelled') {
      previousOrder.status = previousCredit.status === 'paid' ? 'completed' : 'pending';
    }
  }

  if (nextCredit.status === 'cancelled') {
    throw new Error('Cannot pay cancelled customer credit');
  }

  const updated = { id, ...nextInput };
  db.financials[idx] = updated;

  nextCredit.paidAmount += updated.amount;
  nextCredit.status = normalizeCreditStatus(nextCredit);
  const nextOrder = db.orders.find((item) => item.id === nextCredit.orderId);
  if (nextOrder && nextOrder.status !== 'cancelled') {
    nextOrder.status = nextCredit.status === 'paid' ? 'completed' : 'pending';
  }

  return updated;
};

export const removeFinancialTransaction = (id: number) => {
  const idx = db.financials.findIndex((item) => item.id === id);
  if (idx < 0) {
    return false;
  }

  const [removed] = db.financials.splice(idx, 1);
  const credit = db.customerCredits.find((item) => item.id === removed.customerCreditId);
  if (credit) {
    credit.paidAmount -= removed.amount;
    if (credit.paidAmount < 0) {
      credit.paidAmount = 0;
    }
    credit.status = normalizeCreditStatus(credit);

    const order = db.orders.find((item) => item.id === credit.orderId);
    if (order && order.status !== 'cancelled') {
      order.status = credit.status === 'paid' ? 'completed' : 'pending';
    }
  }

  return true;
};

export const removeOrder = (orderId: number) => {
  const orderIdx = db.orders.findIndex((item) => item.id === orderId);
  if (orderIdx < 0) {
    return false;
  }

  db.orders.splice(orderIdx, 1);
  const credits = db.customerCredits.filter((item) => item.orderId === orderId);
  for (const credit of credits) {
    db.financials = db.financials.filter((tx) => tx.customerCreditId !== credit.id);
  }
  db.customerCredits = db.customerCredits.filter((item) => item.orderId !== orderId);

  return true;
};

export const mapOrderStatusFromCredit = (status: CreditStatus): OrderStatus => {
  if (status === 'cancelled') {
    return 'cancelled';
  }
  return status === 'paid' ? 'completed' : 'pending';
};
