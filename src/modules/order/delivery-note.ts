import { ClientSession } from 'mongoose';
import { nextSequence } from '../../shared/persistence';
import { renderHtmlToPdf } from '../../shared/pdf';
import { Order, OrderItem } from '../../shared/types';
import { buildDeliveryNoteHtml, escapeHtml } from './delivery-note-template';
import { Currency } from '../../shared/currency';

const getDeliveryNoteMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

export const generateDeliveryNoteNumber = async (session?: ClientSession, date = new Date()) => {
  const monthKey = getDeliveryNoteMonthKey(date);
  const sequence = await nextSequence(`deliveryNotes:${monthKey}`, session);
  return `DN${monthKey}${String(sequence).padStart(2, '0')}`;
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
  const headerTemplate = `
    <div style="width: 100%; font-size: 9px; color: #666; padding: 0 12mm; box-sizing: border-box; text-align: right; font-family: Arial, sans-serif;">
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
