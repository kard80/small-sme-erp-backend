import { describe, expect, it } from 'vitest';
import { createReceiptNoteDto, getEligibleBillingNotesDto } from './dto';

const oid = 'a'.repeat(24);

describe('receipt note dtos', () => {
  it('require all eligible-billing-note params', () => {
    expect(getEligibleBillingNotesDto.safeParse({ startDate: '2026-01', endDate: '2026-02' }).success).toBe(false);
    expect(getEligibleBillingNotesDto.safeParse({ startDate: '2026-01', endDate: '2026-02', customerId: oid }).success).toBe(true);
  });

  it('requires a non-empty billing note id list and coerces the date', () => {
    expect(createReceiptNoteDto.safeParse({ receiptDate: '2026-01-01', customerId: oid, billingNoteIds: [] }).success).toBe(false);
    const parsed = createReceiptNoteDto.parse({ receiptDate: '2026-01-01', customerId: oid, billingNoteIds: [oid] });
    expect(parsed.receiptDate).toBeInstanceOf(Date);
  });
});
