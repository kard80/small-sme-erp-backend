import { db, nextOrderId, paginate } from '../../shared/store';
import { CreateOrderInput, Order } from '../../shared/types';

export const salesRepository = {
  create(input: CreateOrderInput) {
    const order = { id: nextOrderId(), ...input };
    db.orders.push(order);
    return order;
  },

  list(page: number, pageSize: number) {
    return paginate(db.orders, page, pageSize);
  },

  findById(id: number) {
    return db.orders.find((item) => item.id === id);
  },

  update(id: number, input: Partial<Omit<Order, 'id'>>) {
    const order = this.findById(id);
    if (!order) {
      return undefined;
    }

    Object.assign(order, input);
    return order;
  },

  remove(id: number) {
    const idx = db.orders.findIndex((item) => item.id === id);
    if (idx < 0) {
      return undefined;
    }

    const [removed] = db.orders.splice(idx, 1);
    return removed;
  }
};
