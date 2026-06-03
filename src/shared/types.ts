import { Types } from 'mongoose';

export type CreditStatus = 'pending' | 'paid' | 'cancelled';
export type ProductStatus = 'active' | 'inactive';
export type CreateOrderStatus = 'draft' | 'completed';

export interface MongoEntity {
  _id: Types.ObjectId;
  createdAt?: Date;
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
  customerName: string;
  address: string;
  billName: string;
}

export interface Order extends MongoEntity {
  customerId: string;
  customerBillName: string;
  customerBillAddress: string;
  totalAmount: number;
  dueDate: Date;
  deliveryDate: Date;
  deliveryNote?: string;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface OrderItem extends MongoEntity {
  orderId: Types.ObjectId;
  order: number;
  productId: Types.ObjectId;
  productName: string;
  unit: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  lineTotal: number;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface CustomerCredit extends MongoEntity {
  orderId: string;
  customerId: string;
  totalAmount: number;
  paidAmount: number;
  status: CreditStatus;
}

export interface PaymentTransaction extends MongoEntity {
  customerCreditId: string;
  amount: number;
  paymentDate: Date;
  note?: string;
}

export type FinancialTransaction = PaymentTransaction;

export interface OrderOcrUploadBatch extends MongoEntity {
  folderName: string;
  filenames: string[];
  objectKeys: string[];
  createdAt: Date;
}

export interface CreateOrderInput {
  customerId: string;
  dueDate: Date;
  deliveryDate: Date;
  status: CreateOrderStatus;
  items: CreateOrderItemInput[];
}

export interface CreateOrderItemInput {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
}
