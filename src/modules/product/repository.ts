import { ClientSession } from 'mongoose';
import { ProductModel, nextSequence } from '../../shared/persistence';
import { EntityPatch, NewEntity, Product } from '../../shared/types';

const toProductCreateDoc = (input: NewEntity<Product, 'id'>) => ({
  productName: input.productName,
  unit: input.unit,
  defaultBuyPrice: input.defaultBuyPrice,
  sellPrice: input.sellPrice,
  status: input.status
});

const toProductUpdateDoc = (input: EntityPatch<Product, 'id'>) => {
  const update: Partial<Omit<Product, 'id'>> = {};

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
  async create(input: NewEntity<Product, 'id'>, session?: ClientSession) {
    const [product] = await ProductModel.create(
      [
        {
          id: await nextSequence('products', session),
          ...toProductCreateDoc(input)
        }
      ],
      { session }
    );
    return product.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      ProductModel.find({ status: 'active' })
        .sort({ id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Product[]>(),
      ProductModel.countDocuments({ status: 'active' })
    ]);

    return { data, page, pageSize, total };
  },

  findById(id: number) {
    return ProductModel.findOne({ id, status: 'active' }).lean<Product | null>();
  },

  findByProductName(productName: string) {
    return ProductModel.findOne({ productName, status: 'active' }).lean<Product | null>();
  },

  update(id: number, input: EntityPatch<Product, 'id'>, session?: ClientSession) {
    return ProductModel.findOneAndUpdate(
      { id },
      { $set: toProductUpdateDoc(input) },
      { new: true, runValidators: true }
    )
      .lean<Product | null>()
      .session(session ?? null);
  },

  async remove(id: number, session?: ClientSession) {
    const result = await ProductModel.updateOne({ id }, { $set: { status: 'inactive' } }, { runValidators: true }).session(
      session ?? null
    );
    return result.matchedCount > 0;
  }
};
