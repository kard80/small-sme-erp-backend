import { describe, expect, it } from 'vitest';
import { buildDeliveryNoteHtml } from './delivery-note-template';

const order = { deliveryDate: new Date('2026-10-28'), customerBillName: 'ลูกค้า', customerBillAddress: '' };
const items = [{ productName: 'ข้าวสาร', unit: 'กก.', quantity: 2, sellPrice: 35.5, totalSellPrice: 71 }];

describe('buildDeliveryNoteHtml variants', () => {
  it('defaults to the delivery note', () => {
    const html = buildDeliveryNoteHtml(order, items, 'DN1', 71);
    expect(html).toContain('<h1>ใบส่งสินค้า</h1>');
    expect(html).toContain('ผู้ส่งของ');
  });

  it('renders the receipt title, date label, signatures and total', () => {
    const html = buildDeliveryNoteHtml(order, items, 'RC1', 71, {
      title: 'ใบเสร็จรับเงิน',
      dateLabel: 'วันที่',
      signaturesHtml: '<p>ผู้รับเงิน</p>'
    });
    expect(html).toContain('<h1>ใบเสร็จรับเงิน</h1>');
    expect(html).toContain('ผู้รับเงิน');
    expect(html).not.toContain('ผู้ส่งของ');
    expect(html).toContain('71.00');
  });
});
