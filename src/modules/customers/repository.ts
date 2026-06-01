import { db, nextCustomerId } from '../../shared/store';
import { Customer } from '../../shared/types';

export const customersRepository = {
  create(input: Omit<Customer, 'customerId'>) {
    const customer = { customerId: nextCustomerId(), ...input };
    db.customers.push(customer);
    return customer;
  },

  list() {
    return db.customers;
  },

  findById(id: number) {
    return db.customers.find((item) => item.customerId === id);
  },

  update(id: number, input: Partial<Omit<Customer, 'customerId'>>) {
    const customer = this.findById(id);
    if (!customer) {
      return undefined;
    }

    Object.assign(customer, input);
    return customer;
  },

  remove(id: number) {
    const idx = db.customers.findIndex((item) => item.customerId === id);
    if (idx < 0) {
      return false;
    }

    db.customers.splice(idx, 1);
    return true;
  }
};
