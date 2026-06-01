import { customersRepository } from './repository';

export const customersService = {
  createCustomer(input: Parameters<typeof customersRepository.create>[0]) {
    return customersRepository.create(input);
  },

  listCustomers() {
    return customersRepository.list();
  },

  getCustomer(id: number) {
    return customersRepository.findById(id);
  },

  updateCustomer(id: number, input: Parameters<typeof customersRepository.update>[1]) {
    return customersRepository.update(id, input);
  },

  removeCustomer(id: number) {
    return customersRepository.remove(id);
  }
};
