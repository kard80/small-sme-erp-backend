import { renderHtmlToPdf } from '../../shared/pdf';
import { Order, OrderItem, ProductSupplier, Supplier } from '../../shared/types';
import { deliveryNoteFontFaceCss, escapeHtml, formatThaiDate } from './delivery-note-template';

export const noSupplierGroupName = 'ไม่มีชื่อผู้ขาย';
const thaiCollator = new Intl.Collator('th');

// links must be sorted by priority ASC; each product goes to its first link whose supplier exists
// (soft-deleted suppliers are absent from `suppliers`). `condition` is ignored.
export const groupItemsBySupplier = (items: OrderItem[], links: ProductSupplier[], suppliers: Supplier[]) => {
  const supplierNames = new Map(suppliers.map((s) => [String(s._id), s.supplierName]));
  const productSupplierName = new Map<string, string>();
  for (const link of links) {
    const name = supplierNames.get(String(link.supplierId));
    if (name && !productSupplierName.has(String(link.productId))) {
      productSupplierName.set(String(link.productId), name);
    }
  }

  const groups = new Map<string, OrderItem[]>();
  for (const item of items) {
    const name = productSupplierName.get(String(item.productId)) ?? noSupplierGroupName;
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }

  return [...groups]
    .sort(([a], [b]) =>
      a === noSupplierGroupName ? 1 : b === noSupplierGroupName ? -1 : thaiCollator.compare(a, b))
    .map(([supplierName, groupItems]) => ({ supplierName, items: groupItems }));
};

export type PurchaseListGroup = ReturnType<typeof groupItemsBySupplier>[number];

// Same product + unit across orders is bought once, so quantities are summed.
export const mergeItemsByProduct = (items: OrderItem[]) => {
  const merged = new Map<string, OrderItem>();
  for (const item of items) {
    const key = `${item.productId}|${item.unit}`;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
  }
  return [...merged.values()];
};

const renderPurchaseListHtml = (headerLines: string[], groups: PurchaseListGroup[]) => `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><style>
  ${deliveryNoteFontFaceCss}
  body { font-family: 'DeliveryNoteThai', sans-serif; font-size: 12px; color: #111; }
  h2 { margin: 16px 0 4px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #444; padding: 3px 6px; text-align: left; }
  .seq { width: 50px; text-align: center; } .num { text-align: right; width: 70px; } .unit { width: 70px; } .note { width: 30%; }
</style></head><body>
  ${headerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
  ${groups.map((g) => `
    <h2>${escapeHtml(g.supplierName)}</h2>
    <table><thead><tr><th class="seq">ลำดับที่</th><th>สินค้า</th><th class="num">จำนวน</th><th class="unit">หน่วย</th><th class="note">หมายเหตุ</th></tr></thead>
    <tbody>${g.items.map((i, idx) => `<tr><td class="seq">${idx + 1}</td><td>${escapeHtml(i.productName)}</td><td class="num">${escapeHtml(String(i.quantity))}</td><td>${escapeHtml(i.unit)}</td><td></td></tr>`).join('')}</tbody></table>`).join('')}
</body></html>`;

export const buildPurchaseListHtml = (order: Order, groups: PurchaseListGroup[]) =>
  renderPurchaseListHtml(
    [
      `คำสั่งซื้อ: ${String(order._id)}`,
      `ลูกค้า: ${order.customerBillName}`,
      `วันที่ส่งของ: ${formatThaiDate(order.deliveryDate)}`
    ],
    groups
  );

export const buildCombinedPurchaseListHtml = (orders: Order[], groups: PurchaseListGroup[]) =>
  renderPurchaseListHtml(
    [
      `จำนวนเอกสารที่รวม: ${orders.length} ฉบับ`,
      `ลูกค้า: ${[...new Set(orders.map((o) => o.customerBillName))].join(', ')}`,
      `วันที่ส่งของ: ${[...new Set(orders.map((o) => formatThaiDate(o.deliveryDate)))].join(', ')}`
    ],
    groups
  );

export const generateCombinedPurchaseListPdf = (orders: Order[], groups: PurchaseListGroup[]) =>
  renderHtmlToPdf(buildCombinedPurchaseListHtml(orders, groups));

export const generatePurchaseListPdf = (order: Order, groups: PurchaseListGroup[]) =>
  renderHtmlToPdf(buildPurchaseListHtml(order, groups));
