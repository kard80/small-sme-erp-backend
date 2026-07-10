import moment from 'moment';
import { orderService } from '../../order/service';
import { customersRepository } from '../../customers/repository';
import { ComparableFilter } from '../../../shared/filters';
import { Pagination } from '../../../shared/pagination';
import { NotFoundError } from '../../../shared/errors';
import { renderHtmlToPdf } from '../../../shared/pdf';
import { buildBillingDocumentHtml } from '../billing-document-template';
import { Currency } from '../../../shared/currency';
import { nextSequence, runInTransaction } from '../../../shared/persistence';
import { billingRepository, CreateBillingNoteInput } from '../repository/billing.repository';
import { billingOrderRepository } from '../repository/billing-order.repository';
import { Order } from '../../../types';
import { correctionDepartmentBucketName, uploadObjectToBucket } from '../../../shared/gcs';

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

  async createBillingNote(orderIds: string[], issuedDate: Date, customerId: string) {
    const filter = new ComparableFilter<string>({ $in: orderIds });
    const customerFilter = new ComparableFilter({ $eq: customerId });
    const pagination = new Pagination(1, orderIds.length);
    const orders = await orderService.listOrders({
      where: { _id: filter, customerId: customerFilter },
      pagination,
      sort: { deliveryNote: 1 }
    });

    if (orders.data.length !== orderIds.length) {
      throw new NotFoundError('ไม่พบคำสั่งซื้อบางรายการ');
    }

    const billingNoteResp = await runInTransaction(async (session) => {
      const billingParams: CreateBillingNoteInput = {
        customerId,
        issuedDate,
        totalAmount: orders.data
          .reduce((sum, order) => sum.add(new Currency(order.totalAmount)), new Currency(0))
          .toNumber()
      };
      const billingNote = await billingRepository.createBillingNote(billingParams, session);
      await billingOrderRepository.create(
        {
          billingNoteId: billingNote._id,
          orderIds: orders.data.map((order) => order._id)
        },
        session
      );

      return billingNote;
    });
    await this.generateBillingDocument(moment(issuedDate).format('YYYY-MM'), customerId, orders.data);

    return billingNoteResp;
  },

  async manualInsertBillingNote(billingNoteId: string) {
    const billingNote = await billingRepository.findById(billingNoteId);
    if (!billingNote) {
      throw new NotFoundError('ไม่พบใบแจ้งหนี้');
    }
    const billingNoteOrders = await billingOrderRepository.find({ billingNoteId: billingNote._id });
    const filter = new ComparableFilter<string>({
      $in: billingNoteOrders.map((orderNoteItem) => orderNoteItem.orderId.toString())
    });
    const orders = await orderService.listOrders({
      pagination: new Pagination(1, billingNoteOrders.length),
      where: { _id: filter },
      sort: { deliveryNote: 1 }
    });

    const documentPath = await this.generateBillingDocument(
      moment(billingNote.issuedDate).format('YYYY-MM'),
      billingNote.customerId.toString(),
      orders.data
    );

    return { documentPath };
  },

  async generateBillingDocument(dateInput: string, customerId: string, orders: Order[]) {
    const customer = await customersRepository.findById(customerId);

    if (!customer) {
      throw new NotFoundError('ไม่พบข้อมูลลูกค้า');
    }

    const issueDate = moment(dateInput, 'YYYY-MM').endOf('month').toDate();
    const runningNumber = await nextSequence('billingNotes:' + issueDate);
    const billingDocument = 'BL' + moment(issueDate).format('YYYYMM') + runningNumber.toString().padStart(2, '0');

    const totalAmount = orders.reduce((sum, order) => sum.add(new Currency(order.totalAmount)), new Currency(0));
    const html = buildBillingDocumentHtml(customer, orders, billingDocument, issueDate, totalAmount.toNumber());
    const bytes = await renderHtmlToPdf(html);

    const gcs = await uploadObjectToBucket(
      correctionDepartmentBucketName,
      `BL/${billingDocument}.pdf`,
      bytes,
      'application/pdf'
    );

    return gcs.objectKey;
  }
};
