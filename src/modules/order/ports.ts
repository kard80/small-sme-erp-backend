import { ClientSession } from 'mongoose';
import { CustomerCredit, Order } from '../../shared/types';

export interface OrderCreditPort {
  createCreditForOrder(
    order: Pick<
      Order,
      '_id' | 'customerId' | 'customerBillName' | 'dueDate' | 'deliveryNote' | 'completedAt' | 'cancelledAt'
    > & { totalAmount: number },
    session?: ClientSession
  ): Promise<CustomerCredit>;
  getCreditByOrderId(orderId: string, session?: ClientSession): Promise<CustomerCredit | null | undefined>;
  removeCreditsForOrder(orderId: string, session?: ClientSession): Promise<CustomerCredit[]>;
}
