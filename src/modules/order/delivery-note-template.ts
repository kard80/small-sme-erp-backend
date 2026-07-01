import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ThaiBahtText from 'thai-baht-text';
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

const sellerName = 'ร้านเอกลักษณ์';
const sellerAddress = '237 ถ.สุวรรณศร ต.สระแก้ว อ.เมือง จ.สระแก้ว';
const sellerTel = '037241259, 0652324592';


export const convertAmountToThaiText = (amount: number) => {
  const rounded = Math.round(amount * 100) / 100;
  return ThaiBahtText(rounded) || 'ศูนย์บาทถ้วน';
};

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

export const buildDeliveryNoteHtml = (order: Order, items: OrderItem[], documentNumber: string, orderTotal: number) => {
  const deliveryDate = formatThaiDate(order.deliveryDate);
  const rowsMarkup = buildItemRows(items);
  const amountInThaiText = convertAmountToThaiText(orderTotal);

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

      .seller-name {
        margin-top: 6px;
        font-size: 14px;
        font-weight: 600;
      }

      .seller-detail {
        margin-top: 2px;
        color: var(--muted);
        font-size: 12px;
      }

      .meta-card,
      .customer-card,
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

      .customer-department {
        margin: 6px 0 0;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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

      .totals-row td {
        font-weight: 600;
        background: var(--bg-head);
      }

      .totals-label {
        text-align: right;
      }

      .words-label,
      .words-value {
        font-style: italic;
        font-weight: 400;
        color: var(--muted);
      }

      .words-label {
        text-align: left;
        border-right: none;
      }

      .words-value {
        text-align: center;
        border-left: none;
      }

      .signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 64px;
        margin-top: 22px;
        padding: 18px 16px 14px;
      }

      .signature-col-right {
        padding-left: 16px;
      }

      .signature-block {
        display: inline-block;
        text-align: center;
      }

      .signature-row,
      .signature-row-shorter {
        display: flex;
        align-items: baseline;
        justify-content: flex-start;
        gap: 0;
        margin: 10px 0;
      }

      .signature-blank {
        flex: 0 0 160px;
        min-width: 24px;
        margin: 0;
        border-bottom: 1px solid var(--ink);
      }

      .signature-blank-shorter {
        flex: 0 0 195px;
        min-width: 24px;
        margin: 0;
        border-bottom: 1px solid var(--ink);
      }

      .signature-role {
        margin: 4px 0;
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
        .signatures,
        .signature-col {
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
          <div class="seller-name">${escapeHtml(sellerName)}</div>
          <div class="seller-detail">${escapeHtml(sellerAddress)}</div>
          <div class="seller-detail">${escapeHtml(sellerTel)}</div>
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
        </aside>
      </section>

      <section class="customer-card">
        <p class="customer-heading">ข้อมูลลูกค้า</p>
        <p class="customer-name">${escapeHtml(order.customerBillName)}</p>
        <p class="customer-address">${escapeHtml(order.customerBillAddress)}</p>
        ${order.customerDepartment ? `<p class="customer-department">${escapeHtml(order.customerDepartment)}</p>` : ''}
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
          <tr class="totals-row">
            <td colspan="2" class="words-label">(ตัวอักษร)</td>
            <td colspan="2" class="words-value">(${escapeHtml(amountInThaiText)})</td>
            <td class="totals-label">รวมเงิน</td>
            <td class="numeric totals-value">${formatCurrency(orderTotal)}</td>
          </tr>
        </tbody>
      </table>

      <section class="summary-signatures">
        <div class="signatures">
          <div class="signature-col">
            <div class="signature-block">
              <div class="signature-row">
                <span>ลงชื่อ</span>
                <span class="signature-blank"></span>
                <span>ผู้ส่งของ</span>
              </div>
              <p class="signature-role">${escapeHtml(sellerName)}</p>
            </div>
          </div>
          <div class="signature-col signature-col-right">
            <div class="signature-row">
                <span>ลงชื่อ</span>
                <span class="signature-blank"></span>
                <span>${escapeHtml('ประธานกรรมการ')}</span>
            </div>
            <div class="signature-row">
              <span>ลงชื่อ</span>
              <span class="signature-blank-shorter"></span>
              <span>${escapeHtml('กรรมการ')}</span>
            </div>
            <div class="signature-row">
              <span>ลงชื่อ</span>
              <span class="signature-blank-shorter"></span>
              <span>${escapeHtml('กรรมการ')}</span>
            </div>
            <div class="signature-row">
              <span>ลงชื่อ</span>
              <span class="signature-blank-shorter"></span>
              <span>${escapeHtml('เจ้าหน้าที่')}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="footer-note">เอกสารนี้จัดทำโดยระบบเพื่อใช้ประกอบการส่งมอบสินค้า</div>
    </main>
  </body>
</html>`;
};
