import { ClientSession } from 'mongoose';
import { nextSequence } from '../../shared/persistence';
import { renderHtmlToPdf } from '../../shared/pdf';
import { BadRequestError } from '../../shared/errors';
import { Order, OrderItem } from '../../shared/types';
import { buildDeliveryNoteHtml, deliveryNoteFontFaceCss, escapeHtml } from './delivery-note-template';
import { Currency } from '../../shared/currency';

const getDeliveryNoteMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

// Customers with a dedicated delivery-note prefix (customer.deliveryNotePrefix) get their own
// running number sequence, separate from the shared "DN" sequence used by every other customer.
// Every delivery note's running number is capped at 2 digits (01-99) per calendar month; a 100th
// delivery note in the same month is rejected rather than silently overflowing to 3 digits.
const maxDeliveryNoteSequence = 99;

const getDeliveryNoteSequenceConfig = (
  monthKey: string,
  customer?: { _id: { toString(): string }; deliveryNotePrefix?: string }
) => {
  const prefix = customer?.deliveryNotePrefix?.trim();
  if (prefix) {
    return {
      documentPrefix: prefix,
      sequenceKey: `deliveryNotes:customer:${customer!._id.toString()}:${monthKey}`
    };
  }

  return {
    documentPrefix: 'DN',
    sequenceKey: `deliveryNotes:${monthKey}`
  };
};

export const generateDeliveryNoteNumber = async (
  session?: ClientSession,
  date = new Date(),
  customer?: { _id: { toString(): string }; deliveryNotePrefix?: string }
) => {
  const monthKey = getDeliveryNoteMonthKey(date);
  const { documentPrefix, sequenceKey } = getDeliveryNoteSequenceConfig(monthKey, customer);

  const sequence = await nextSequence(sequenceKey, session);
  if (sequence > maxDeliveryNoteSequence) {
    throw new BadRequestError(
      `เลขที่ใบส่งของในเดือนนี้เกิน ${maxDeliveryNoteSequence} ฉบับแล้ว (เลขที่วิ่ง ${sequence})`
    );
  }

  return `${documentPrefix}${monthKey}${String(sequence).padStart(2, '0')}`;
};

export const generateDeliveryNotePdfBuffer = async (
  order: Order,
  items: OrderItem[],
  documentNumber: string
) => {
  const filename = `${documentNumber}.pdf`;
  const orderTotal = items
    .reduce((total, item) => total.add(new Currency(item.totalSellPrice)), new Currency(0))
    .toNumber();
  const html = buildDeliveryNoteHtml(order, items, documentNumber, orderTotal);
  // Puppeteer/Playwright render headerTemplate/footerTemplate in an isolated
  // frame that has no access to the main document's <style>, so the Thai
  // font must be embedded again here or "หน้า" renders as tofu boxes.
  const headerTemplate = `
    <style>${deliveryNoteFontFaceCss}</style>
    <div style="width: 100%; font-size: 9px; color: #333; font-weight: 700; padding: 0 12mm; box-sizing: border-box; text-align: right; font-family: 'DeliveryNoteThai', sans-serif;">
      ${escapeHtml(documentNumber)} &nbsp;&bull;&nbsp; หน้า <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>
  `;
  const buffer = await renderHtmlToPdf(html, { headerTemplate });

  return {
    documentNumber,
    filename,
    contentType: 'application/pdf' as const,
    bytes: buffer
  };
};
