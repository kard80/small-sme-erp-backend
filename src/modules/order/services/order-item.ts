import { FindProductHistoryOptions, orderItemRepository } from '../repository/order-item.repository';

class OrderItemService {
  async findProductHistory(options: FindProductHistoryOptions) {
    return orderItemRepository.findProductHistory(options);
  }
}

export const orderItemService = new OrderItemService();
