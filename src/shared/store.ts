import { Customer, Order, Product } from './types';

export const db = {
  products: [] as Product[],
  customers: [] as Customer[],
  orders: [] as Order[]
};

let productSeq = 1;
let customerSeq = 1;
let orderSeq = 1;

export const nextProductId = () => productSeq++;
export const nextCustomerId = () => customerSeq++;
export const nextOrderId = () => orderSeq++;

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
  productSeq = 1;
  customerSeq = 1;
  orderSeq = 1;
};
