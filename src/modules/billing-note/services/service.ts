import moment from 'moment';
import { orderService } from '../../order/service';
import { customersRepository } from '../../customers/repository';
import { ComparableFilter } from '../../../shared/filters';
import { Pagination } from '../../../shared/pagination';
import { NotFoundError } from '../../../shared/errors';
import { renderHtmlToPdf } from '../../../shared/pdf';
import { buildBillingNoteDocumentHtml } from '../billing-note-document-template';
import { Currency } from '../../../shared/currency';
import { nextSequence, runInTransaction } from '../../../shared/persistence';
import { billingNoteRepository, CreateBillingNoteInput } from '../repository/billing-note.repository';
import { billingNoteOrderRepository } from '../repository/billing-note-order.repository';
import { Order } from '../../../types';
import {
  correctionDepartmentBucketName,
  createSignedObjectDownloadUrl,
  deleteObjectFromBucket,
  uploadObjectToBucket
} from '../../../shared/gcs';

export const billingNoteService = {
  async getBillingNotes(dateInput: string, customerId?: string) {
    const date = moment(dateInput, 'YYYY-MM');
    if (!date.isValid()) {
      throw new Error('Invalid date format, expected YYYY-MM');
    }

    const startDate = date.clone().startOf('month').toDate();
    const endDate = date.clone().endOf('month').toDate();

    const billingNotes = await billingNoteRepository.list(startDate, endDate, customerId);

    const customerIds = [...new Set(billingNotes.data.map((item) => item.customerId.toString()))];
    const customers = await customersRepository.findByIds(customerIds);
    const customerNameById = new Map(customers.map((customer) => [customer._id.toString(), customer.customerName]));

    return {
      ...billingNotes,
      data: billingNotes.data.map((item) => ({
        ...item,
        customerName: customerNameById.get(item.customerId.toString()) ?? ''
      }))
    };
  },

  async getEligibleOrders(startDateInput: string, endDateInput: string, customerId: string) {
    const startMonth = moment(startDateInput, 'YYYY-MM');
    const endMonth = moment(endDateInput, 'YYYY-MM');
    if (!startMonth.isValid() || !endMonth.isValid()) {
      throw new Error('Invalid date format, expected YYYY-MM');
    }
    if (startMonth.isAfter(endMonth)) {
      throw new Error('startDate must not be after endDate');
    }

    const startDate = startMonth.clone().startOf('month').toDate();
    const endDate = endMonth.clone().endOf('month').toDate();

    const dateFilter = new ComparableFilter({ $gte: startDate, $lte: endDate });
    const customerFilter = new ComparableFilter({ $eq: customerId });

    const [orders, billedOrderIds] = await Promise.all([
      orderService.listOrders({
        where: {
          deliveryDate: dateFilter,
          customerId: customerFilter,
          deliveryNote: new ComparableFilter({ $ne: null })
        },
        pagination: new Pagination(),
        sort: { deliveryDate: 1, deliveryNote: 1 }
      }),
      billingNoteOrderRepository.listBilledOrderIds()
    ]);

    const billedOrderIdSet = new Set(billedOrderIds.map((orderId) => orderId.toString()));

    return {
      ...orders,
      data: orders.data.filter((order) => !billedOrderIdSet.has(order._id.toString()))
    };
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
      const billingNoteParams: CreateBillingNoteInput = {
        customerId,
        issuedDate,
        totalAmount: orders.data
          .reduce((sum, order) => sum.add(new Currency(order.totalAmount)), new Currency(0))
          .toNumber()
      };
      const billingNote = await billingNoteRepository.createBillingNote(billingNoteParams, session);
      await billingNoteOrderRepository.create(
        {
          billingNoteId: billingNote._id,
          orderIds: orders.data.map((order) => order._id)
        },
        session
      );

      return billingNote;
    });
    const documentNumber = await this.generateBillingNoteDocument(issuedDate, customerId, orders.data);
    const updatedBillingNote = await billingNoteRepository.setDocumentNumber(
      billingNoteResp._id.toString(),
      documentNumber
    );

    return updatedBillingNote ?? billingNoteResp;
  },

  async manualInsertBillingNote(billingNoteId: string) {
    const billingNote = await billingNoteRepository.findById(billingNoteId);
    if (!billingNote) {
      throw new NotFoundError('ไม่พบใบแจ้งหนี้');
    }
    const billingNoteOrders = await billingNoteOrderRepository.find({ billingNoteId: billingNote._id });
    const filter = new ComparableFilter<string>({
      $in: billingNoteOrders.map((orderNoteItem) => orderNoteItem.orderId.toString())
    });
    const orders = await orderService.listOrders({
      pagination: new Pagination(1, billingNoteOrders.length),
      where: { _id: filter },
      sort: { deliveryNote: 1 }
    });

    const documentNumber = await this.generateBillingNoteDocument(
      billingNote.issuedDate,
      billingNote.customerId.toString(),
      orders.data,
      billingNote.documentNumber
    );
    await billingNoteRepository.setDocumentNumber(billingNoteId, documentNumber);

    return { documentPath: documentNumber };
  },

  async getBillingNoteDocumentDownloadUrl(billingNoteId: string) {
    const billingNote = await billingNoteRepository.findById(billingNoteId);
    if (!billingNote) {
      throw new NotFoundError('ไม่พบใบแจ้งหนี้');
    }
    if (!billingNote.documentNumber) {
      throw new NotFoundError('ไม่พบเอกสารใบวางบิลสำหรับใบแจ้งหนี้นี้');
    }

    return createSignedObjectDownloadUrl({
      bucketName: correctionDepartmentBucketName,
      objectKey: `BL/${billingNote.documentNumber}.pdf`,
      responseDisposition: `inline; filename="${billingNote.documentNumber}.pdf"`
    });
  },

  async generateBillingNoteDocument(
    issueDate: Date,
    customerId: string,
    orders: Order[],
    billingNoteNumber?: string
  ) {
    const customer = await customersRepository.findById(customerId);

    if (!customer) {
      throw new NotFoundError('ไม่พบข้อมูลลูกค้า');
    }

    let billingNoteDocument = billingNoteNumber;
    if (!billingNoteDocument) {
      const monthBucket = moment(issueDate).format('YYYY-MM');
      const runningNumber = await nextSequence('billingNotes:' + monthBucket);
      billingNoteDocument = 'BL' + moment(issueDate).format('YYYYMM') + runningNumber.toString().padStart(2, '0');
    }

    const totalAmount = orders.reduce((sum, order) => sum.add(new Currency(order.totalAmount)), new Currency(0));
    const html = buildBillingNoteDocumentHtml(customer, orders, billingNoteDocument, issueDate, totalAmount.toNumber());
    const bytes = await renderHtmlToPdf(html);

    await uploadObjectToBucket(
      correctionDepartmentBucketName,
      `BL/${billingNoteDocument}.pdf`,
      bytes,
      'application/pdf'
    );

    return billingNoteDocument;
  },

  async deleteBillingNote(billingNoteId: string) {
    const billingNote = await billingNoteRepository.findById(billingNoteId);
    if (!billingNote) {
      throw new NotFoundError('ไม่พบใบแจ้งหนี้');
    }

    await runInTransaction(async (session) => {
      await billingNoteOrderRepository.deleteByBillingNoteId(billingNoteId, session);
      await billingNoteRepository.deleteBillingNote(billingNoteId, session);
    });

    await deleteObjectFromBucket(correctionDepartmentBucketName, `BL/${billingNote.documentNumber}.pdf`);
  }
};
