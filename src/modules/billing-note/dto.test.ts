import { describe, expect, it } from 'vitest';
import { createBillingNoteDto, getBillingNotesDto } from './dto';

const oid = 'a'.repeat(24);

describe('billing note dtos', () => {
  it('validate month format and customer id', () => {
    expect(getBillingNotesDto.safeParse({ date: '2026-01' }).success).toBe(true);
    expect(getBillingNotesDto.safeParse({ date: 'Jan' }).success).toBe(false);
    expect(getBillingNotesDto.safeParse({ date: '2026-01', customerId: 'x' }).success).toBe(false);
  });

  it('requires a non-empty order id list and coerces the date', () => {
    expect(createBillingNoteDto.safeParse({ issuedDate: '2026-01-01', customerId: oid, orderIds: [] }).success).toBe(false);
    const parsed = createBillingNoteDto.parse({ issuedDate: '2026-01-01', customerId: oid, orderIds: [oid] });
    expect(parsed.issuedDate).toBeInstanceOf(Date);
  });
});
