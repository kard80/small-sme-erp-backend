import mongoose, { ClientSession, Schema, model, models } from 'mongoose';
import { CreditStatus, Customer, CustomerCredit, Order, OrderStatus, PaymentTransaction, Product, ProductStatus } from './types';

mongoose.set('strictQuery', true);

const baseSchemaOptions = {
  strict: 'throw' as const,
  versionKey: false as const,
  minimize: false as const
};

const productStatusValues: ProductStatus[] = ['active', 'inactive'];

const productSchema = new Schema<Product>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    id: { type: Number, required: true, unique: true },
    productName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    defaultBuyPrice: { type: Number, required: false, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: productStatusValues, default: 'active' }
  },
  baseSchemaOptions
);

const customerSchema = new Schema<Customer>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    customerId: { type: Number, required: true, unique: true },
    customerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    billName: { type: String, required: true, trim: true }
  },
  baseSchemaOptions
);

const orderStatusValues: OrderStatus[] = ['pending', 'completed', 'cancelled'];
const creditStatusValues: CreditStatus[] = ['pending', 'paid', 'cancelled'];

const orderSchema = new Schema<Order>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    id: { type: Number, required: true, unique: true },
    productId: { type: Number, required: true, index: true },
    productName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    buyPrice: { type: Number, required: true, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    customerId: { type: Number, required: true, index: true },
    dueDate: { type: String, required: true },
    status: { type: String, required: true, enum: orderStatusValues }
  },
  baseSchemaOptions
);

const customerCreditSchema = new Schema<CustomerCredit>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    id: { type: Number, required: true, unique: true },
    orderId: { type: Number, required: true, index: true },
    customerId: { type: Number, required: true, index: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: creditStatusValues }
  },
  baseSchemaOptions
);

const paymentTransactionSchema = new Schema<PaymentTransaction>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    id: { type: Number, required: true, unique: true },
    customerCreditId: { type: Number, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: String, required: true },
    note: { type: String, required: false, trim: true }
  },
  baseSchemaOptions
);

const counterSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 }
  },
  baseSchemaOptions
);

export const ProductModel = models.Product || model<Product>('Product', productSchema);
export const CustomerModel = models.Customer || model<Customer>('Customer', customerSchema);
export const OrderModel = models.Order || model<Order>('Order', orderSchema);
export const CustomerCreditModel =
  models.CustomerCredit || model<CustomerCredit>('CustomerCredit', customerCreditSchema);
export const PaymentTransactionModel =
  models.PaymentTransaction || model<PaymentTransaction>('PaymentTransaction', paymentTransactionSchema);
const CounterModel = models.Counter || model('Counter', counterSchema);

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
      new: true,
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
