import { ClientSession, Types } from 'mongoose';
import { ConflictError } from '../../shared/errors';
import { ProductModel, ProductSupplierModel, SupplierModel } from '../../shared/persistence';
import { EntityPatch, NewEntity, Product, ProductSupplier, Supplier } from '../../shared/types';

const duplicateNameMessage = 'ชื่อผู้ขายนี้มีอยู่แล้ว';

const rethrowDuplicate = (error: unknown): never => {
  if ((error as { code?: number })?.code === 11000) {
    throw new ConflictError(duplicateNameMessage);
  }
  throw error;
};

// Whitelisted fields only. '' means "absent" on create.
const toCreateDoc = (input: EntityPatch<Supplier, never>) => ({
  ...(input.supplierName !== undefined && { supplierName: input.supplierName }),
  ...(input.phone && { phone: input.phone }),
  ...(input.remark && { remark: input.remark })
});

// '' unsets the field; undefined leaves it untouched.
const toUpdateOps = (input: EntityPatch<Supplier, never>) => {
  const $set: Record<string, string> = {};
  const $unset: Record<string, 1> = {};
  if (input.supplierName !== undefined) {
    $set.supplierName = input.supplierName;
  }
  for (const key of ['phone', 'remark'] as const) {
    if (input[key] === '') {
      $unset[key] = 1;
    } else if (input[key] !== undefined) {
      $set[key] = input[key] as string;
    }
  }
  return { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
};

export const suppliersRepository = {
  async create(input: NewEntity<Supplier, never>, session?: ClientSession) {
    try {
      const [supplier] = await SupplierModel.create([toCreateDoc(input)], { session });
      return supplier.toObject();
    } catch (error) {
      return rethrowDuplicate(error);
    }
  },

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      SupplierModel.find({ deletedAt: null })
        .sort({ supplierName: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<Supplier[]>(),
      SupplierModel.countDocuments({ deletedAt: null })
    ]);

    return { data, page, pageSize, total };
  },

  findById(_id: string, session?: ClientSession) {
    return SupplierModel.findOne({ _id, deletedAt: null }).session(session ?? null).lean<Supplier | null>();
  },

  findByIds(ids: string[], session?: ClientSession) {
    return SupplierModel.find({ _id: { $in: ids }, deletedAt: null }).session(session ?? null).lean<Supplier[]>();
  },

  async update(_id: string, input: EntityPatch<Supplier, never>, session?: ClientSession) {
    try {
      return await SupplierModel.findOneAndUpdate(
        { _id, deletedAt: null },
        toUpdateOps(input),
        { returnDocument: 'after', runValidators: true }
      ).session(session ?? null).lean<Supplier | null>();
    } catch (error) {
      return rethrowDuplicate(error);
    }
  },

  remove(_id: string, session?: ClientSession) {
    return SupplierModel.findOneAndUpdate(
      { _id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'before' }
    ).session(session ?? null).lean<Supplier | null>();
  }
};

type LinkInput = { priority: number; condition?: { note?: string } };

export const productSuppliersRepository = {
  // Soft-deleted suppliers / inactive products are filtered by the callers' lookups, so
  // stale links are never returned and never need cascading cleanup.
  findByProductId(productId: string) {
    return ProductSupplierModel.find({ productId }).sort({ priority: 1 }).lean<ProductSupplier[]>();
  },

  findByProductIds(productIds: string[]) {
    return ProductSupplierModel.find({ productId: { $in: productIds } }).sort({ priority: 1 }).lean<ProductSupplier[]>();
  },

  async countByProductIds(productIds: string[]) {
    const rows = await ProductSupplierModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { productId: { $in: productIds.map((id) => new Types.ObjectId(id)) } } },
      { $group: { _id: '$productId', count: { $sum: 1 } } }
    ]);
    return new Map(rows.map((r) => [String(r._id), r.count]));
  },

  findBySupplierId(supplierId: string) {
    return ProductSupplierModel.find({ supplierId }).sort({ priority: 1 }).lean<ProductSupplier[]>();
  },

  async replaceForProduct(productId: string, links: Array<LinkInput & { supplierId: string }>, session: ClientSession) {
    await ProductSupplierModel.deleteMany({ productId }, { session });
    await ProductSupplierModel.create(
      links.map((l) => ({ productId, supplierId: l.supplierId, priority: l.priority, condition: l.condition })),
      { session, ordered: true }
    );
  },

  async replaceForSupplier(supplierId: string, links: Array<LinkInput & { productId: string }>, session: ClientSession) {
    await ProductSupplierModel.deleteMany({ supplierId }, { session });
    await ProductSupplierModel.create(
      links.map((l) => ({ productId: l.productId, supplierId, priority: l.priority, condition: l.condition })),
      { session, ordered: true }
    );
  },

  findActiveProductsByIds(ids: string[], session?: ClientSession) {
    return ProductModel.find({ _id: { $in: ids }, status: 'active', deletedAt: null })
      .session(session ?? null)
      .lean<Product[]>();
  }
};
