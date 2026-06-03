import mongoose, { ClientSession, Schema, model, models } from 'mongoose';
import {
  CreditStatus,
  Customer,
  CustomerCredit,
  Order,
  OrderItem,
  OrderOcrUploadBatch,
  PaymentTransaction,
  Product,
  ProductStatus
} from './types';

mongoose.set('strictQuery', true);

const baseSchemaFields = {
  createdAt: { type: Date, required: true, default: Date.now }
};

const baseSchemaOptions = {
  strict: 'throw' as const,
  versionKey: false as const,
  minimize: false as const
};

const collectionNames = {
  product: 'products',
  customer: 'customers',
  order: 'orders',
  orderItem: 'order_items',
  customerCredit: 'customer_credits',
  paymentTransaction: 'payment_transactions',
  orderOcrUploadBatch: 'order_ocr_upload_batches',
  counter: 'counters'
} as const;

const createBaseSchema = <T>(definition: Record<string, unknown>) =>
  new Schema<T>(
    {
      _id: { type: Schema.Types.ObjectId, auto: true },
      ...baseSchemaFields,
      ...definition
    },
    baseSchemaOptions
  );

const productStatusValues: ProductStatus[] = ['active', 'inactive'];

const productSchema = createBaseSchema<Product>({
    productName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    defaultBuyPrice: { type: Number, required: false, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: productStatusValues, default: 'active' }
});

const customerSchema = createBaseSchema<Customer>({
    customerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    billName: { type: String, required: true, trim: true }
});

const creditStatusValues: CreditStatus[] = ['pending', 'partial', 'paid', 'cancelled'];

const orderSchema = createBaseSchema<Order>({
    customerId: { type: String, required: true, index: true, trim: true },
    customerBillName: { type: String, required: true, trim: true },
    customerBillAddress: { type: String, required: true, trim: true },
    totalAmount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    deliveryDate: { type: Date, required: true },
    deliveryNote: { type: String, required: false, trim: true },
    completedAt: { type: Date, required: false, default: null },
    cancelledAt: { type: Date, required: false, default: null }
});

const customerCreditSchema = createBaseSchema<CustomerCredit>({
    orderId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, index: true },
    deliveryNote: { type: String, required: false, trim: true },
    customerBillName: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: creditStatusValues }
});

const orderItemSchema = createBaseSchema<OrderItem>({
    orderId: { type: Schema.Types.ObjectId, required: true, index: true },
    order: { type: Number, required: true, min: 1 },
    productId: { type: Schema.Types.ObjectId, required: true, index: true },
    productName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    buyPrice: { type: Number, required: true, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, required: false, default: null },
    cancelledAt: { type: Date, required: false, default: null }
});

const paymentTransactionSchema = createBaseSchema<PaymentTransaction>({
    customerCreditId: { type: String, required: true, index: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, required: true },
    note: { type: String, required: false, trim: true }
});

const orderOcrUploadBatchSchema = createBaseSchema<OrderOcrUploadBatch>({
    folderName: { type: String, required: true, trim: true },
    filenames: { type: [String], required: true },
    objectKeys: { type: [String], required: true },
    createdAt: { type: Date, required: true }
});

const counterSchema = createBaseSchema({
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 }
});

export const ProductModel = models.Product || model<Product>('Product', productSchema, collectionNames.product);
export const CustomerModel = models.Customer || model<Customer>('Customer', customerSchema, collectionNames.customer);
export const OrderModel = models.Order || model<Order>('Order', orderSchema, collectionNames.order);
export const OrderItemModel =
  models.OrderItem || model<OrderItem>('OrderItem', orderItemSchema, collectionNames.orderItem);
export const CustomerCreditModel =
  models.CustomerCredit ||
  model<CustomerCredit>('CustomerCredit', customerCreditSchema, collectionNames.customerCredit);
export const PaymentTransactionModel =
  models.PaymentTransaction ||
  model<PaymentTransaction>('PaymentTransaction', paymentTransactionSchema, collectionNames.paymentTransaction);
export const OrderOcrUploadBatchModel =
  models.OrderOcrUploadBatch ||
  model<OrderOcrUploadBatch>('OrderOcrUploadBatch', orderOcrUploadBatchSchema, collectionNames.orderOcrUploadBatch);
const CounterModel = models.Counter || model('Counter', counterSchema, collectionNames.counter);

let initPromise: Promise<void> | undefined;

export const initiateDb = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!initPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is required');
    }

    initPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000)
      })
      .then((connection) => {
        console.log('Connected to MongoDB:', connection.connection.host);
      })
      .catch((error) => {
        console.error('Failed to connect to MongoDB', error);
        initPromise = undefined;
        throw error;
      });
  }

  await initPromise;
};

export const disconnectPersistence = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  initPromise = undefined;
};

export const assertDbReady = () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database has not been initialized. Call initiateDb() before creating the app.');
  }
};

export const runInTransaction = async <T>(work: (session: ClientSession) => Promise<T>) => {
  assertDbReady();

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};

export const nextSequence = async (key: string, session?: ClientSession) => {
  const counter = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  )
    .session(session ?? null)
    .lean<{ key: string; value: number }>();

  if (!counter) {
    throw new Error(`Failed to increment sequence ${key}`);
  }

  return counter.value;
};
