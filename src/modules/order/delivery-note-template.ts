import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import moment from '../../shared/moment';
import { Order, OrderItem } from '../../shared/types';

const thaiMonthNames = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม'
] as const;

const assetsRoot = resolve(__dirname, '../../../assets/fonts');
const latinFontBase64 = readFileSync(resolve(assetsRoot, 'noto-sans-thai-latin-400-normal.woff2')).toString('base64');
const thaiFontBase64 = readFileSync(resolve(assetsRoot, 'noto-sans-thai-thai-400-normal.woff2')).toString('base64');

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const formatThaiDate = (value?: Date | null) => {
  if (!value) {
    return '';
  }

  const m = moment(value).utcOffset('+07:00');
  const day = m.date();
  const month = thaiMonthNames[m.month()];
  const year = m.year() + 543;
  return `${day} ${month} ${year}`;
};

const buildItemRows = (items: OrderItem[]) => {
  return items
    .map((item, index) => {
      return `
        <tr>
          <td class="col-index">${index + 1}</td>
          <td class="col-product">${escapeHtml(item.productName)}</td>
          <td class="col-qty numeric">${escapeHtml(String(item.quantity))}</td>
          <td class="col-unit">${escapeHtml(item.unit)}</td>
          <td class="col-price numeric">${formatCurrency(item.sellPrice)}</td>
          <td class="col-total numeric">${formatCurrency(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join('');
};

export const buildDeliveryNoteHtml = (
  order: Order,
  items: OrderItem[],
  documentNumber: string,
  orderTotal: number
) => {
  const deliveryDate = formatThaiDate(order.deliveryDate);
  const createdDate = formatThaiDate(order.createdAt);
  const rowsMarkup = buildItemRows(items);

  return `<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`${documentNumber}.pdf`)}</title>
    <style>
      @font-face {
        font-family: 'DeliveryNoteThai';
        src: url(data:font/woff2;base64,${latinFontBase64}) format('woff2');
        font-style: normal;
        font-weight: 400;
        unicode-range: U+0000-00FF, U+2000-206F;
      }

      @font-face {
        font-family: 'DeliveryNoteThai';
        src: url(data:font/woff2;base64,${thaiFontBase64}) format('woff2');
        font-style: normal;
        font-weight: 400;
        unicode-range: U+0E00-0E7F;
      }

      :root {
        color-scheme: light;
        --border: #d1d9e0;
        --muted: #64748b;
        --bg-soft: #f8fafc;
        --bg-head: #e8f0fb;
        --ink: #0f172a;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        color: var(--ink);
        font-family: 'DeliveryNoteThai', sans-serif;
        font-size: 12px;
        line-height: 1.45;
        -webkit-font-smoothing: antialiased;
      }

      body {
        background: white;
      }

      .document {
        width: 100%;
      }

      .header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: 16px;
        align-items: start;
        margin-bottom: 16px;
      }

      .title-block h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .subtitle {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .meta-card,
      .customer-card,
      .summary-box,
      .signatures {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: white;
      }

      .meta-card {
        padding: 12px 14px;
      }

      .meta-row {
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }

      .meta-row + .meta-row {
        margin-top: 8px;
      }

      .meta-label {
        color: var(--muted);
        white-space: nowrap;
      }

      .meta-value {
        font-weight: 500;
        min-width: 0;
        word-break: break-word;
      }

      .customer-card {
        padding: 14px;
        margin-bottom: 14px;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      }

      .customer-heading {
        margin: 0 0 10px;
        font-size: 13px;
        color: var(--muted);
      }

      .customer-name {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }

      .customer-address {
        margin: 6px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      col.col-index { width: 8%; }
      col.col-product { width: 38%; }
      col.col-qty { width: 11%; }
      col.col-unit { width: 11%; }
      col.col-price { width: 15%; }
      col.col-total { width: 17%; }

      thead {
        display: table-header-group;
      }

      thead th {
        padding: 4px 12px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        background: var(--bg-head);
        border: 1px solid var(--border);
      }

      tbody td {
        padding: 4px 12px;
        vertical-align: top;
        border: 1px solid var(--border);
        background: white;
        line-height: 1.2;
      }

      tbody tr:nth-child(even) td {
        background: var(--bg-soft);
      }

      .numeric {
        text-align: right;
        white-space: nowrap;
      }

      .col-index {
        text-align: center;
      }

      .col-product {
        word-break: break-word;
      }

      .summary-signatures {
        margin-top: 16px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .summary-box {
        margin-left: auto;
        width: min(260px, 100%);
        padding: 12px 14px;
        background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
      }

      .summary-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        font-size: 14px;
        font-weight: 600;
      }

      .signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
        margin-top: 22px;
        padding: 18px 16px 14px;
      }

      .signature-box {
        min-height: 96px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }

      .signature-line {
        border-top: 1px solid #94a3b8;
        padding-top: 8px;
        text-align: center;
      }

      .footer-note {
        margin-top: 14px;
        color: var(--muted);
        font-size: 11px;
      }

      @page {
        size: A4;
        margin: 14mm 12mm 16mm;
      }

      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        tr,
        td,
        th,
        .meta-card,
        .customer-card,
        .summary-box,
        .signatures,
        .signature-box {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="document">
      <section class="header">
        <div class="title-block">
          <h1>ใบส่งสินค้า</h1>
          <div class="subtitle">เอกสารส่งมอบสินค้าและสรุปรายการสำหรับลูกค้า</div>
        </div>
        <aside class="meta-card">
          <div class="meta-row">
            <span class="meta-label">เลขที่</span>
            <span class="meta-value">${escapeHtml(documentNumber)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">วันที่ส่งสินค้า</span>
            <span class="meta-value">${escapeHtml(deliveryDate)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">วันที่สร้าง</span>
            <span class="meta-value">${escapeHtml(createdDate)}</span>
          </div>
        </aside>
      </section>

      <section class="customer-card">
        <p class="customer-heading">ข้อมูลลูกค้า</p>
        <p class="customer-name">${escapeHtml(order.customerBillName)}</p>
        <p class="customer-address">${escapeHtml(order.customerBillAddress)}</p>
      </section>

      <table aria-label="รายการสินค้าในใบส่งสินค้า">
        <colgroup>
          <col class="col-index" />
          <col class="col-product" />
          <col class="col-qty" />
          <col class="col-unit" />
          <col class="col-price" />
          <col class="col-total" />
        </colgroup>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>รายการ</th>
            <th class="numeric">จำนวน</th>
            <th>หน่วย</th>
            <th class="numeric">ราคา</th>
            <th class="numeric">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMarkup}
        </tbody>
      </table>

      <section class="summary-signatures">
        <div class="summary-box">
          <div class="summary-row">
            <span>รวมทั้งสิ้น</span>
            <span>${formatCurrency(orderTotal)}</span>
          </div>
        </div>

        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line">ผู้ส่งสินค้า</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">ผู้รับสินค้า</div>
          </div>
        </div>
      </section>

      <div class="footer-note">เอกสารนี้จัดทำโดยระบบเพื่อใช้ประกอบการส่งมอบสินค้า</div>
    </main>
  </body>
</html>`;
};
