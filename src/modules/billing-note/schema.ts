import { model, Types } from 'mongoose';
import { MongoEntity } from '../../types';
import { collectionNames, createBaseSchema } from '../../shared/persistence';

export interface BillingNote extends MongoEntity {
  customerId: Types.ObjectId;
  issuedDate: Date;
  totalAmount: number;
  documentNumber?: string;
}

export interface BillingNoteOrders extends MongoEntity {
  billingNoteId: Types.ObjectId;
  orderId: Types.ObjectId;
  totalAmount: number;
}

const billingNoteSchema = createBaseSchema<BillingNote>({
  customerId: { type: Types.ObjectId, required: true, index: true },
  issuedDate: { type: Date, required: true },
  totalAmount: { type: Number, required: true, min: 0 },
  documentNumber: { type: String, required: false }
});

const billingNoteOrderSchema = createBaseSchema<BillingNoteOrders>({
  billingNoteId: { type: Types.ObjectId, required: true, index: true },
  orderId: { type: Types.ObjectId, required: true, index: true },
});

export const BillingNoteModel = model<BillingNote>('BillingNote', billingNoteSchema, collectionNames.billingNote);
export const BillingNoteOrderModel = model<BillingNoteOrders>(
  'BillingNoteOrder',
  billingNoteOrderSchema,
  collectionNames.billingNoteOrder
);
