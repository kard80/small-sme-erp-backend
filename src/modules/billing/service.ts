import moment from 'moment';
import { orderService } from '../order/service';
import { customersRepository } from '../customers/repository';
import { ComparableFilter } from '../../shared/filters';
import { Pagination } from '../../shared/pagination';
import { NotFoundError } from '../../shared/errors';
import { renderHtmlToPdf } from '../../shared/pdf';
import { buildBillingDocumentHtml } from './billing-document-template';
import { Currency } from '../../shared/currency';

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
  },

  async generateBillingDocument(dateInput: string, customerId: string) {
    const [{ data: orders }, customer] = await Promise.all([
      this.getBilling(dateInput, customerId),
      customersRepository.findById(customerId)
    ]);

    if (!customer) {
      throw new NotFoundError('ไม่พบข้อมูลลูกค้า');
    }

    if (orders.length === 0) {
      throw new NotFoundError('ไม่พบรายการสั่งซื้อสำหรับลูกค้าในเดือนที่ระบุ');
    }

    const issueDate = moment(dateInput, 'YYYY-MM').endOf('month').toDate();
    const billingDocument = 'BL' + moment(issueDate).format('YYYYMM') + '01';

    const totalAmount = orders.reduce((sum, order) => sum.add(new Currency(order.totalAmount)), new Currency(0));
    const filename = `${billingDocument}.pdf`;
    const html = buildBillingDocumentHtml(customer, orders, billingDocument, issueDate, totalAmount.toNumber());
    const bytes = await renderHtmlToPdf(html);

    return {
      documentNumber: billingDocument,
      filename,
      contentType: 'application/pdf' as const,
      bytes
    };
  }
};
