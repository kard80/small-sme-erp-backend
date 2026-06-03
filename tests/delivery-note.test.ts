import { Types } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { generateDeliveryNotePdfBuffer } from '../src/modules/order/delivery-note';
import { buildDeliveryNoteHtml, formatThaiDate } from '../src/modules/order/delivery-note-template';
import { Order, OrderItem } from '../src/shared/types';

const buildOrder = (overrides: Partial<Order> = {}): Order => {
  const orderId = new Types.ObjectId();

  return {
    _id: orderId,
    customerId: 'CUST-TH-01',
    customerBillName: 'บริษัท ตัวอย่าง จำกัด',
    customerBillAddress: '99 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
    totalAmount: 150,
    dueDate: new Date('2026-06-30T00:00:00.000+07:00'),
    deliveryDate: new Date('2026-06-20T00:00:00.000+07:00'),
    createdAt: new Date('2026-06-01T00:00:00.000+07:00'),
    ...overrides
  };
};

const buildItem = (orderId: Types.ObjectId, index: number, overrides: Partial<OrderItem> = {}): OrderItem => {
  return {
    _id: new Types.ObjectId(),
    orderId,
    order: index + 1,
    productId: new Types.ObjectId(),
    productName: `สินค้า ${index + 1}`,
    unit: 'ชิ้น',
    quantity: 1,
    buyPrice: 50,
    sellPrice: 100,
    lineTotal: 100,
    ...overrides
  };
};

describe('delivery note template', () => {
  it('formats Thai dates for the delivery metadata row', () => {
    expect(formatThaiDate(new Date('2026-06-20T00:00:00.000Z'))).toBe('20 มิถุนายน 2569');
  });

  it('builds HTML with separated delivery date metadata and summary layout', () => {
    const order = buildOrder();
    const items = [
      buildItem(order._id, 0, {
        productName: 'ข้าวหอมมะลิถุงใหญ่พิเศษ ขนาด 5 กิโลกรัม สำหรับทดสอบข้อความยาวมาก',
        quantity: 12,
        sellPrice: 1234.56,
        lineTotal: 14814.72
      })
    ];

    const html = buildDeliveryNoteHtml(order, items, 'DN20260601', 14814.72);

    expect(html).toContain('วันที่ส่งสินค้า');
    expect(html).toContain('20 มิถุนายน 2569');
    expect(html).toContain('รวมทั้งสิ้น');
    expect(html).toContain('table-layout: fixed');
    expect(html).toContain('grid-template-columns: 96px minmax(0, 1fr);');
    expect(html).toContain('บริษัท ตัวอย่าง จำกัด');
    expect(html).toContain('14,814.72');
  });
});

describe('generateDeliveryNotePdfBuffer', () => {
  it('builds a valid PDF when item text contains Thai characters', async () => {
    const order = buildOrder();
    const items: OrderItem[] = [
      buildItem(order._id, 0, {
        productName: 'ข้าวหอมมะลิ',
        unit: 'ถุง',
        quantity: 2,
        sellPrice: 75,
        lineTotal: 150
      })
    ];

    const deliveryNote = await generateDeliveryNotePdfBuffer(order, items, 'DN20260601');
    const pdf = await PDFDocument.load(deliveryNote.bytes);

    expect(deliveryNote.filename).toBe('DN20260601.pdf');
    expect(deliveryNote.contentType).toBe('application/pdf');
    expect(deliveryNote.bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(deliveryNote.bytes.length).toBeGreaterThan(1000);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('splits long item lists across multiple pages', async () => {
    const order = buildOrder({
      customerId: 'CUST-TH-02',
      customerBillName: 'บริษัท หลายรายการ จำกัด',
      customerBillAddress: '100 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
      totalAmount: 4500
    });
    const items: OrderItem[] = Array.from({ length: 45 }, (_, index) =>
      buildItem(order._id, index, {
        productName: `สินค้า ${index + 1} รายการสำหรับทดสอบการตัดหน้าและการแสดงผลของคอลัมน์รวม`,
        sellPrice: 100,
        lineTotal: 100
      })
    );

    const deliveryNote = await generateDeliveryNotePdfBuffer(order, items, 'DN20260602');
    const pdf = await PDFDocument.load(deliveryNote.bytes);

    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
