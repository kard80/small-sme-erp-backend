import { model, Types } from 'mongoose';
import { MongoEntity } from '../../types';
import { collectionNames, createBaseSchema } from '../../shared/persistence';

export interface ReceiptNote extends MongoEntity {
  customerId: Types.ObjectId;
  receiptDate: Date;
  totalAmount: number;
  documentNumber: string;
}

export interface ReceiptNoteBillingNotes extends MongoEntity {
  receiptNoteId: Types.ObjectId;
  billingNoteId: Types.ObjectId;
}

const receiptNoteSchema = createBaseSchema<ReceiptNote>({
  customerId: { type: Types.ObjectId, required: true, index: true },
  receiptDate: { type: Date, required: true },
  totalAmount: { type: Number, required: true, min: 0 },
  documentNumber: { type: String, required: false }
});

const receiptNoteBillingNoteSchema = createBaseSchema<ReceiptNoteBillingNotes>({
  receiptNoteId: { type: Types.ObjectId, required: true, index: true },
  billingNoteId: { type: Types.ObjectId, required: true, index: true }
});

export const ReceiptNoteModel = model<ReceiptNote>('ReceiptNote', receiptNoteSchema, collectionNames.receiptNote);
export const ReceiptNoteBillingNoteModel = model<ReceiptNoteBillingNotes>(
  'ReceiptNoteBillingNote',
  receiptNoteBillingNoteSchema,
  collectionNames.receiptNoteBillingNote
);
