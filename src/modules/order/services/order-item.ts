import { FindProductHistoryOptions, orderItemRepository } from '../repository/order-item.repository';

class OrderItemService {
  getAverageBuyPrices(productIds: string[]) {
    return orderItemRepository.averageBuyPriceByProductIds(productIds);
  }

  async findProductHistory(options: FindProductHistoryOptions) {
    return orderItemRepository.findProductHistory(options);
  }
}

export const orderItemService = new OrderItemService();
