import { customersRepository } from './repository';

export const customersService = {
  createCustomer(input: Parameters<typeof customersRepository.create>[0]) {
    return customersRepository.create(input);
  },

  listCustomers(page: number, pageSize: number) {
    return customersRepository.list(page, pageSize);
  },

  getCustomer(_id: string) {
    return customersRepository.findById(_id);
  },

  updateCustomer(_id: string, input: Parameters<typeof customersRepository.update>[1]) {
    return customersRepository.update(_id, input);
  },

  removeCustomer(_id: string) {
    return customersRepository.remove(_id);
  }
};
