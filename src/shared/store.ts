import { Customer, CustomerCredit, Order, PaymentTransaction, Product } from './types';

export const db = {
  products: [] as Product[],
  customers: [] as Customer[],
  orders: [] as Order[],
  customerCredits: [] as CustomerCredit[],
  financials: [] as PaymentTransaction[]
};

let productSeq = 1;
let customerSeq = 1;
let orderSeq = 1;
let creditSeq = 1;
let financialSeq = 1;

export const nextProductId = () => productSeq++;
export const nextCustomerId = () => customerSeq++;
export const nextOrderId = () => orderSeq++;
export const nextCreditId = () => creditSeq++;
export const nextFinancialId = () => financialSeq++;

export const paginate = <T>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    page,
    pageSize,
    total: items.length
  };
};

export const resetInMemoryStore = () => {
  db.products.length = 0;
  db.customers.length = 0;
  db.orders.length = 0;
  db.customerCredits.length = 0;
  db.financials.length = 0;
  productSeq = 1;
  customerSeq = 1;
  orderSeq = 1;
  creditSeq = 1;
  financialSeq = 1;
};
