import { ClientSession } from 'mongoose';
import { nextSequence } from '../../shared/persistence';
import { renderHtmlToPdf } from '../../shared/pdf';
import { Order, OrderItem } from '../../shared/types';
import { buildDeliveryNoteHtml } from './delivery-note-template';

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
  const orderTotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const html = buildDeliveryNoteHtml(order, items, documentNumber, orderTotal);
  const buffer = await renderHtmlToPdf(html);

  return {
    documentNumber,
    filename,
    contentType: 'application/pdf' as const,
    bytes: buffer
  };
};
