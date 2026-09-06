import moment from 'moment';
import { customersRepository } from '../../customers/repository';
import { billingNoteRepository } from '../../billing-note/repository/billing-note.repository';
import { BillingNote } from '../../billing-note/schema';
import { NotFoundError, ConflictError } from '../../../shared/errors';
import { renderHtmlToPdf } from '../../../shared/pdf';
import { buildReceiptNoteDocumentHtml } from '../receipt-note-document-template';
import { Currency } from '../../../shared/currency';
import { nextSequence, runInTransaction } from '../../../shared/persistence';
import { receiptNoteRepository, CreateReceiptNoteInput } from '../repository/receipt-note.repository';
import { receiptNoteBillingNoteRepository } from '../repository/receipt-note-billing-note.repository';
import {
  correctionDepartmentBucketName,
  createSignedObjectDownloadUrl,
  deleteObjectFromBucket,
  uploadObjectToBucket
} from '../../../shared/gcs';

export const receiptNoteService = {
  async getReceiptNotes(dateInput: string, customerId?: string) {
    const date = moment(dateInput, 'YYYY-MM');
    if (!date.isValid()) {
      throw new Error('Invalid date format, expected YYYY-MM');
    }

    const startDate = date.clone().startOf('month').toDate();
    const endDate = date.clone().endOf('month').toDate();

    const receiptNotes = await receiptNoteRepository.list(startDate, endDate, customerId);

    const customerIds = [...new Set(receiptNotes.data.map((item) => item.customerId.toString()))];
    const customers = await customersRepository.findByIds(customerIds);
    const customerNameById = new Map(customers.map((customer) => [customer._id.toString(), customer.customerName]));

    return {
      ...receiptNotes,
      data: receiptNotes.data.map((item) => ({
        ...item,
        customerName: customerNameById.get(item.customerId.toString()) ?? ''
      }))
    };
  },

  async getReceiptNoteDetail(receiptNoteId: string) {
    const receiptNote = await receiptNoteRepository.findById(receiptNoteId);
    if (!receiptNote) {
      throw new NotFoundError('ไม่พบใบเสร็จรับเงิน');
    }

    const [customer, receiptNoteBillingNotes] = await Promise.all([
      customersRepository.findById(receiptNote.customerId.toString()),
      receiptNoteBillingNoteRepository.find({ receiptNoteId: receiptNote._id })
    ]);

    const billingNoteIds = receiptNoteBillingNotes.map((item) => item.billingNoteId.toString());
    const billingNotes = await billingNoteRepository.findByIds(billingNoteIds);
    const sortedBillingNotes = [...billingNotes].sort((a, b) => a.issuedDate.getTime() - b.issuedDate.getTime());

    return {
      ...receiptNote,
      customerName: customer?.customerName ?? '',
      billingNotes: sortedBillingNotes
    };
  },

  async getEligibleBillingNotes(startDateInput: string, endDateInput: string, customerId: string) {
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

    const [billingNotes, receiptedBillingNoteIds] = await Promise.all([
      billingNoteRepository.list(startDate, endDate, customerId),
      receiptNoteBillingNoteRepository.listReceiptedBillingNoteIds()
    ]);

    const receiptedBillingNoteIdSet = new Set(receiptedBillingNoteIds.map((id) => id.toString()));

    return {
      ...billingNotes,
      data: billingNotes.data.filter(
        (billingNote) =>
          Boolean(billingNote.documentNumber) && !receiptedBillingNoteIdSet.has(billingNote._id.toString())
      )
    };
  },

  async createReceiptNote(billingNoteIds: string[], receiptDate: Date, customerId: string) {
    const billingNotes = await billingNoteRepository.findByIds(billingNoteIds);
    const matchingBillingNotes = billingNotes.filter(
      (billingNote) => billingNote.customerId.toString() === customerId
    );

    if (matchingBillingNotes.length !== billingNoteIds.length) {
      throw new NotFoundError('ไม่พบใบวางบิลบางรายการ');
    }

    if (matchingBillingNotes.some((billingNote) => !billingNote.documentNumber)) {
      throw new ConflictError('มีใบวางบิลบางรายการยังไม่มีเลขที่เอกสาร');
    }

    const receiptedBillingNoteIds = await receiptNoteBillingNoteRepository.listReceiptedBillingNoteIds(billingNoteIds);
    if (receiptedBillingNoteIds.length > 0) {
      throw new ConflictError('มีใบวางบิลบางรายการถูกออกใบเสร็จแล้ว');
    }

    const sortedBillingNotes = [...matchingBillingNotes].sort(
      (a, b) => a.issuedDate.getTime() - b.issuedDate.getTime()
    );

    const receiptNoteResp = await runInTransaction(async (session) => {
      const receiptNoteParams: CreateReceiptNoteInput = {
        customerId,
        receiptDate,
        totalAmount: sortedBillingNotes
          .reduce((sum, billingNote) => sum.add(new Currency(billingNote.totalAmount)), new Currency(0))
          .toNumber()
      };
      const receiptNote = await receiptNoteRepository.createReceiptNote(receiptNoteParams, session);
      await receiptNoteBillingNoteRepository.create(
        {
          receiptNoteId: receiptNote._id,
          billingNoteIds: sortedBillingNotes.map((billingNote) => billingNote._id)
        },
        session
      );

      return receiptNote;
    });

    const documentNumber = await this.generateReceiptNoteDocument(receiptDate, customerId, sortedBillingNotes);
    const updatedReceiptNote = await receiptNoteRepository.setDocumentNumber(
      receiptNoteResp._id.toString(),
      documentNumber
    );

    return updatedReceiptNote ?? receiptNoteResp;
  },

  async manualInsertReceiptNote(receiptNoteId: string) {
    const receiptNote = await receiptNoteRepository.findById(receiptNoteId);
    if (!receiptNote) {
      throw new NotFoundError('ไม่พบใบเสร็จรับเงิน');
    }
    const receiptNoteBillingNotes = await receiptNoteBillingNoteRepository.find({ receiptNoteId: receiptNote._id });
    const billingNoteIds = receiptNoteBillingNotes.map((item) => item.billingNoteId.toString());
    const billingNotes = await billingNoteRepository.findByIds(billingNoteIds);
    const sortedBillingNotes = [...billingNotes].sort((a, b) => a.issuedDate.getTime() - b.issuedDate.getTime());

    const documentNumber = await this.generateReceiptNoteDocument(
      receiptNote.receiptDate,
      receiptNote.customerId.toString(),
      sortedBillingNotes,
      receiptNote.documentNumber
    );
    await receiptNoteRepository.setDocumentNumber(receiptNoteId, documentNumber);

    return { documentPath: documentNumber };
  },

  async getReceiptNoteDocumentDownloadUrl(receiptNoteId: string) {
    const receiptNote = await receiptNoteRepository.findById(receiptNoteId);
    if (!receiptNote) {
      throw new NotFoundError('ไม่พบใบเสร็จรับเงิน');
    }
    if (!receiptNote.documentNumber) {
      throw new NotFoundError('ไม่พบเอกสารใบเสร็จรับเงินสำหรับรายการนี้');
    }

    return createSignedObjectDownloadUrl({
      bucketName: correctionDepartmentBucketName,
      objectKey: `RC/${receiptNote.documentNumber}.pdf`,
      responseDisposition: `inline; filename="${receiptNote.documentNumber}.pdf"`
    });
  },

  async generateReceiptNoteDocument(
    receiptDate: Date,
    customerId: string,
    billingNotes: BillingNote[],
    receiptNoteNumber?: string
  ) {
    const customer = await customersRepository.findById(customerId);

    if (!customer) {
      throw new NotFoundError('ไม่พบข้อมูลลูกค้า');
    }

    let receiptNoteDocument = receiptNoteNumber;
    if (!receiptNoteDocument) {
      const monthBucket = moment(receiptDate).format('YYYY-MM');
      const runningNumber = await nextSequence('receiptNotes:' + monthBucket);
      receiptNoteDocument = 'RC' + moment(receiptDate).format('YYYYMM') + runningNumber.toString().padStart(2, '0');
    }

    const totalAmount = billingNotes.reduce(
      (sum, billingNote) => sum.add(new Currency(billingNote.totalAmount)),
      new Currency(0)
    );
    const html = buildReceiptNoteDocumentHtml(
      customer,
      billingNotes,
      receiptNoteDocument,
      receiptDate,
      totalAmount.toNumber()
    );
    const bytes = await renderHtmlToPdf(html);

    await uploadObjectToBucket(correctionDepartmentBucketName, `RC/${receiptNoteDocument}.pdf`, bytes, 'application/pdf');

    return receiptNoteDocument;
  },

  async deleteReceiptNote(receiptNoteId: string) {
    const receiptNote = await receiptNoteRepository.findById(receiptNoteId);
    if (!receiptNote) {
      throw new NotFoundError('ไม่พบใบเสร็จรับเงิน');
    }

    await runInTransaction(async (session) => {
      await receiptNoteBillingNoteRepository.deleteByReceiptNoteId(receiptNoteId, session);
      await receiptNoteRepository.deleteReceiptNote(receiptNoteId, session);
    });

    await deleteObjectFromBucket(correctionDepartmentBucketName, `RC/${receiptNote.documentNumber}.pdf`);
  }
};
