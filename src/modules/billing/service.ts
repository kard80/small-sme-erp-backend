import moment from 'moment';
import { orderService } from '../order/service';
import { ComparableFilter } from '../../shared/filters';
import { Pagination } from '../../shared/pagination';

export const billingService = {
  getBilling(dateInput: string, customerId: string) {
    const date = moment(dateInput, 'YYYY-MM');
    if (!date.isValid()) {
      throw new Error('Invalid date format, expected YYYY-MM');
    }

    const startDate = date.clone().startOf('month').toDate();
    const endDate = date.clone().endOf('month').toDate();

    const dateFilter = new ComparableFilter({ $gte: startDate, $lte: endDate });
    const customerFilter = new ComparableFilter({ $eq: customerId });

    return orderService.listOrders({
      where: {
        deliveryDate: dateFilter,
        customerId: customerFilter,
        deliveryNote: new ComparableFilter({ $ne: null })
      },
      pagination: new Pagination(),
      sort: { deliveryDate: 1, deliveryNote: 1 }
    });
  }
};
