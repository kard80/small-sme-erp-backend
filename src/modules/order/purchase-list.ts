import { renderHtmlToPdf } from '../../shared/pdf';
import { Order, OrderItem, ProductSupplier, Supplier } from '../../shared/types';
import { deliveryNoteFontFaceCss, escapeHtml, formatThaiDate } from './delivery-note-template';

export const noSupplierGroupName = 'ไม่มีชื่อผู้ขาย';
export const noSupplierId = 'none';
const thaiCollator = new Intl.Collator('th');

// links must be sorted by priority ASC; each product goes to its first link whose supplier exists
// (soft-deleted suppliers are absent from `suppliers`). `condition` is ignored.
export const groupItemsBySupplier = (items: OrderItem[], links: ProductSupplier[], suppliers: Supplier[]) => {
  const supplierNames = new Map(suppliers.map((s) => [String(s._id), s.supplierName]));
  const productSupplier = new Map<string, { supplierId: string; supplierName: string }>();
  for (const link of links) {
    const supplierId = String(link.supplierId);
    const supplierName = supplierNames.get(supplierId);
    if (supplierName && !productSupplier.has(String(link.productId))) {
      productSupplier.set(String(link.productId), { supplierId, supplierName });
    }
  }

  const groups = new Map<string, { supplierId: string; supplierName: string; items: OrderItem[] }>();
  for (const item of items) {
    const sup = productSupplier.get(String(item.productId)) ?? { supplierId: noSupplierId, supplierName: noSupplierGroupName };
    const group = groups.get(sup.supplierId) ?? { ...sup, items: [] };
    group.items.push(item);
    groups.set(sup.supplierId, group);
  }

  return [...groups.values()].sort((a, b) =>
    a.supplierId === noSupplierId ? 1 : b.supplierId === noSupplierId ? -1 : thaiCollator.compare(a.supplierName, b.supplierName));
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

// 0 = no price configured
const formatCost = (n: number) => !n ? '-' : n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <table><thead><tr><th class="seq">ลำดับที่</th><th>สินค้า</th><th class="num">จำนวน</th><th class="unit">หน่วย</th><th class="num">ต้นทุน</th><th class="note">หมายเหตุ</th></tr></thead>
    <tbody>${g.items.map((i, idx) => `<tr><td class="seq">${idx + 1}</td><td>${escapeHtml(i.productName)}</td><td class="num">${escapeHtml(String(i.quantity))}</td><td>${escapeHtml(i.unit)}</td><td class="num">${escapeHtml(formatCost(i.buyPrice))}</td><td></td></tr>`).join('')}</tbody></table>`).join('')}
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
