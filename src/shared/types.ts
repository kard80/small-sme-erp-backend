import { Types } from 'mongoose';

export type ProductStatus = 'active' | 'inactive';
export type CreateOrderStatus = 'draft' | 'completed';

export interface MongoEntity {
  _id: Types.ObjectId;
  createdAt?: Date;
  deletedAt?: Date | null;
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
  customerId: Types.ObjectId;
  customerBillName: string;
  customerBillAddress: string;
  customerDepartment?: string;
  totalAmount: number;
  totalExpense?: number;
  dueDate: Date;
  deliveryDate: Date;
  deliveryNote?: string;
  materialCategory?: string;
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
  totalSellPrice: number;
  totalBuyPrice: number;
  completedAt?: Date | null;
}

export interface CreateOrderInput {
  customerId: string;
  customerDepartment?: string;
  materialCategory?: string;
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
