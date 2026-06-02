import { Types } from 'mongoose';

export type OrderStatus = 'pending' | 'completed' | 'cancelled';
export type CreditStatus = 'pending' | 'paid' | 'cancelled';
export type ProductStatus = 'active' | 'inactive';

export interface MongoEntity {
  _id: Types.ObjectId;
}

export type NewEntity<T extends MongoEntity, GeneratedKey extends keyof T> = Omit<T, GeneratedKey | '_id'>;
export type EntityPatch<T extends MongoEntity, GeneratedKey extends keyof T> = Partial<Omit<T, GeneratedKey | '_id'>>;

export interface Product extends MongoEntity {
  productName: string;
  unit: string;
  defaultBuyPrice?: number;
  sellPrice: number;
  status: ProductStatus;
}

export interface Customer extends MongoEntity {
  customerId: number;
  customerName: string;
  address: string;
  billName: string;
}

export interface Order extends MongoEntity {
  id: number;
  productId: string;
  productName: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  customerId: number;
  dueDate: string;
  status: OrderStatus;
}

export interface CustomerCredit extends MongoEntity {
  id: number;
  orderId: number;
  customerId: number;
  totalAmount: number;
  paidAmount: number;
  status: CreditStatus;
}

export interface PaymentTransaction extends MongoEntity {
  id: number;
  customerCreditId: number;
  amount: number;
  paymentDate: string;
  note?: string;
}

export type FinancialTransaction = PaymentTransaction;

export interface CreateOrderInput {
  productId: string;
  productName: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  customerId: number;
  dueDate: string;
  status: OrderStatus;
}
