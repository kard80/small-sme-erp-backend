import { ClientSession } from 'mongoose';
import { ProductModel } from '../../shared/persistence';
import { EntityPatch, NewEntity, Product } from '../../shared/types';

const toProductCreateDoc = (input: NewEntity<Product, never>) => ({
  productName: input.productName,
  unit: input.unit,
  defaultBuyPrice: input.defaultBuyPrice,
  sellPrice: input.sellPrice,
  status: input.status
});

const toProductUpdateDoc = (input: EntityPatch<Product, never>) => {
  const update: Partial<Omit<Product, '_id'>> = {};

  if (input.productName !== undefined) {
    update.productName = input.productName;
  }
  if (input.unit !== undefined) {
    update.unit = input.unit;
  }
  if (input.defaultBuyPrice !== undefined) {
    update.defaultBuyPrice = input.defaultBuyPrice;
  }
  if (input.sellPrice !== undefined) {
    update.sellPrice = input.sellPrice;
  }
  if (input.status !== undefined) {
    update.status = input.status;
  }

  return update;
};

export const productRepository = {
  async create(input: NewEntity<Product, never>, session?: ClientSession) {
    const [product] = await ProductModel.create([toProductCreateDoc(input)], { session });
    return product.toObject();
  },

  async list(page: number, pageSize: number, countZeroBuyPrice?: boolean) {
    const [data, total, zeroBuyPriceCount] = await Promise.all([
      ProductModel.find({ status: 'active' })
        .sort({ productName: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Product[]>(),
      ProductModel.countDocuments({ status: 'active' }),
      countZeroBuyPrice
        ? ProductModel.countDocuments({ status: 'active', defaultBuyPrice: 0 })
        : Promise.resolve(null)
    ]);

    return { data, page, pageSize, total, zeroBuyPriceCount };
  },

  findById(_id: string) {
    return ProductModel.findOne({ _id, status: 'active' }).lean<Product | null>();
  },

  findByProductName(productName: string) {
    return ProductModel.findOne({ productName, status: 'active' }).lean<Product | null>();
  },

  search(query: string) {
    return ProductModel.find({
      status: 'active',
      productName: { $regex: query, $options: 'i' }
    })
      .sort({ productName: 1 })
      .lean<Product[]>();
  },

  update(_id: string, input: EntityPatch<Product, never>, session?: ClientSession) {
    return ProductModel.findOneAndUpdate(
      { _id },
      { $set: toProductUpdateDoc(input) },
      { returnDocument: 'after', runValidators: true }
    )
      .lean<Product | null>()
      .session(session ?? null);
  },

  async remove(_id: string, session?: ClientSession) {
    const result = await ProductModel.updateOne(
      { _id },
      { $set: { status: 'inactive' } },
      { runValidators: true }
    ).session(session ?? null);
    return result.matchedCount > 0;
  }
};
