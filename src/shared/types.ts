export type OrderStatus = 'pending' | 'completed' | 'cancelled';
export type CreditStatus = 'pending' | 'paid' | 'cancelled';

export interface Product {
  id: number;
  productName: string;
  unit: string;
  defaultBuyPrice: number;
  defaultSellPrice: number;
}

export interface Customer {
  customerId: number;
  customerName: string;
  address: string;
  billName: string;
}

export interface Order {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  customerId: number;
  dueDate: string;
  status: OrderStatus;
}

export interface CustomerCredit {
  id: number;
  orderId: number;
  customerId: number;
  totalAmount: number;
  paidAmount: number;
  status: CreditStatus;
}

export interface PaymentTransaction {
  id: number;
  customerCreditId: number;
  amount: number;
  paymentDate: string;
  note?: string;
}

export type FinancialTransaction = PaymentTransaction;

export interface CreateOrderInput {
  productId: number;
  productName: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  customerId: number;
  dueDate: string;
  status: OrderStatus;
}
