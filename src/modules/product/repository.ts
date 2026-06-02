import { ClientSession } from 'mongoose';
import { ProductModel, nextSequence } from '../../shared/persistence';
import { EntityPatch, NewEntity, Product } from '../../shared/types';

export const productRepository = {
  async create(input: NewEntity<Product, 'id'>, session?: ClientSession) {
    const [product] = await ProductModel.create(
      [
        {
          id: await nextSequence('products', session),
          ...input
        }
      ],
      { session }
    );
    return product.toObject();
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      ProductModel.find().sort({ id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Product[]>(),
      ProductModel.countDocuments()
    ]);

    return { data, page, pageSize, total };
  },

  findById(id: number) {
    return ProductModel.findOne({ id }).lean<Product | null>();
  },

  update(id: number, input: EntityPatch<Product, 'id'>, session?: ClientSession) {
    return ProductModel.findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true }).lean<
      Product | null
    >().session(session ?? null);
  },

  async remove(id: number, session?: ClientSession) {
    const result = await ProductModel.deleteOne({ id }).session(session ?? null);
    return result.deletedCount > 0;
  }
};
