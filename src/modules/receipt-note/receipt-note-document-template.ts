import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ThaiBahtText from 'thai-baht-text';
import moment from '../../shared/moment';
import { Customer } from '../../shared/types';
import { BillingNote } from '../billing-note/schema';

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
const sellerTaxId = 'เลขประจำตัวผู้เสียภาษี 3250400514004';

const receiptItemDescription = 'ค่าวัตถุดิบประกอบอาหาร';

const convertAmountToThaiText = (amount: number) => {
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

const formatThaiDate = (value?: Date | null) => {
  if (!value) {
    return '';
  }

  const m = moment(value).utcOffset('+07:00');
  const day = m.date();
  const month = thaiMonthNames[m.month()];
  const year = m.year() + 543;
  return `${day} ${month} ${year}`;
};

const buildBillingNoteRows = (billingNotes: BillingNote[]) => {
  return billingNotes
    .map((billingNote, index) => {
      return `
        <tr>
          <td class="col-index">${index + 1}</td>
          <td class="col-doc">${escapeHtml(billingNote.documentNumber ?? '')}</td>
          <td class="col-item">${escapeHtml(receiptItemDescription)}</td>
          <td class="col-total numeric">${formatCurrency(billingNote.totalAmount)}</td>
        </tr>
      `;
    })
    .join('');
};

export const buildReceiptNoteDocumentHtml = (
  customer: Customer,
  billingNotes: BillingNote[],
  documentNumber: string,
  receiptDate: Date,
  totalAmount: number
) => {
  const rowsMarkup = buildBillingNoteRows(billingNotes);
  const amountInThaiText = convertAmountToThaiText(totalAmount);

  return `<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`${documentNumber}.pdf`)}</title>
    <style>
      @font-face {
        font-family: 'ReceiptDocumentThai';
        src: url(data:font/woff2;base64,${latinFontBase64}) format('woff2');
        font-style: normal;
        font-weight: 400;
        unicode-range: U+0000-00FF, U+2000-206F;
      }

      @font-face {
        font-family: 'ReceiptDocumentThai';
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
        font-family: 'ReceiptDocumentThai', sans-serif;
        font-size: 12px;
        line-height: 1.45;
        -webkit-font-smoothing: antialiased;
      }

      body {
        background: white;
      }

      .document {
        width: 100%;
        max-width: calc(100% - 4px);
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
      .customer-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: white;
      }

      .meta-card {
        padding: 12px 14px;
      }

      .meta-row {
        display: grid;
        grid-template-columns: 90px minmax(0, 1fr);
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

      .meta-value-nowrap {
        white-space: nowrap;
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

      col.col-index { width: 12%; }
      col.col-doc { width: 22%; }
      col.col-item { width: 34%; }
      col.col-total { width: 32%; }

      thead {
        display: table-header-group;
      }

      thead th {
        padding: 4px 12px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
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

      .totals-row td {
        font-weight: 600;
        background: var(--bg-head);
      }

      .words-label {
        text-align: left;
        font-style: italic;
        font-weight: 400;
        color: var(--muted);
        border-right: none;
      }

      .words-value {
        position: relative;
        text-align: right;
        font-style: italic;
        font-weight: 400;
        color: var(--muted);
        border-left: none;
      }

      .words-value-text {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
      }

      .signatures {
        display: flex;
        justify-content: center;
        margin-top: 48px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .signature-block {
        display: inline-block;
        text-align: center;
      }

      .signature-row {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 0;
        margin: 10px 0;
      }

      .signature-blank {
        flex: 0 0 180px;
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
        .customer-card {
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
          <h1>ใบเสร็จรับเงิน</h1>
          <div class="seller-name">${escapeHtml(sellerName)}</div>
          <div class="seller-detail">${escapeHtml(sellerAddress)}</div>
          <div class="seller-detail">${escapeHtml(sellerTaxId)}</div>
        </div>
        <aside class="meta-card">
          <div class="meta-row">
            <span class="meta-label">เลขที่ใบเสร็จ</span>
            <span class="meta-value">${escapeHtml(documentNumber)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">วันที่รับชำระ</span>
            <span class="meta-value meta-value-nowrap">${escapeHtml(formatThaiDate(receiptDate))}</span>
          </div>
        </aside>
      </section>

      <section class="customer-card">
        <p class="customer-heading">ข้อมูลลูกค้า</p>
        <p class="customer-name">${escapeHtml(customer.billName)}</p>
        <p class="customer-address">${escapeHtml(customer.address)}</p>
        <p class="customer-address">เลขประจำตัวผู้เสียภาษี 0994000284314</p>
      </section>

      <table aria-label="รายการใบเสร็จรับเงิน">
        <colgroup>
          <col class="col-index" />
          <col class="col-doc" />
          <col class="col-item" />
          <col class="col-total" />
        </colgroup>
        <thead>
          <tr>
            <th>ลำดับที่</th>
            <th>เลขที่เอกสาร</th>
            <th>รายการ</th>
            <th class="numeric">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMarkup}
          <tr class="totals-row">
            <td colspan="2" class="words-label">รวมเงิน</td>
            <td class="words-value"><span class="words-value-text">(${escapeHtml(amountInThaiText)})</span></td>
            <td class="numeric totals-value">${formatCurrency(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      <section class="signatures">
        <div class="signature-block">
          <div class="signature-row">
            <span>ลงชื่อ</span>
            <span class="signature-blank"></span>
            <span>ผู้รับเงิน</span>
          </div>
          <p class="signature-role">(________________________________)</p>
        </div>
      </section>
    </main>
  </body>
</html>`;
};
