import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { nextSequenceMock } = vi.hoisted(() => ({
  nextSequenceMock: vi.fn()
}));

vi.mock('../src/shared/persistence', () => ({
  nextSequence: nextSequenceMock
}));

import { generateDeliveryNoteNumber } from '../src/modules/order/delivery-note';

describe('generateDeliveryNoteNumber', () => {
  afterEach(() => {
    nextSequenceMock.mockReset();
  });

  const date = new Date('2026-06-15T00:00:00.000+07:00');

  it('uses the shared DN sequence when the customer has no dedicated prefix', async () => {
    nextSequenceMock.mockResolvedValueOnce(7);

    const documentNumber = await generateDeliveryNoteNumber(undefined, date);

    expect(documentNumber).toBe('DN20260607');
    expect(nextSequenceMock).toHaveBeenCalledWith('deliveryNotes:202606', undefined);
  });

  it('uses a customer-dedicated sequence and prefix when the customer has one set', async () => {
    const customerId = new Types.ObjectId();
    nextSequenceMock.mockResolvedValueOnce(3);

    const documentNumber = await generateDeliveryNoteNumber(undefined, date, {
      _id: customerId,
      deliveryNotePrefix: 'ส'
    });

    expect(documentNumber).toBe('ส20260603');
    expect(nextSequenceMock).toHaveBeenCalledWith(`deliveryNotes:customer:${customerId.toString()}:202606`, undefined);
  });

  it('rejects generating a 100th delivery note for the same customer in the same month', async () => {
    const customerId = new Types.ObjectId();
    nextSequenceMock.mockResolvedValueOnce(100);

    await expect(
      generateDeliveryNoteNumber(undefined, date, { _id: customerId, deliveryNotePrefix: 'ส' })
    ).rejects.toThrow(/เกิน 99/);
  });

  it('rejects generating a 100th delivery note on the shared DN sequence too', async () => {
    nextSequenceMock.mockResolvedValueOnce(100);

    await expect(generateDeliveryNoteNumber(undefined, date)).rejects.toThrow(/เกิน 99/);
  });

  it('falls back to the shared sequence when the customer prefix is blank', async () => {
    const customerId = new Types.ObjectId();
    nextSequenceMock.mockResolvedValueOnce(1);

    const documentNumber = await generateDeliveryNoteNumber(undefined, date, {
      _id: customerId,
      deliveryNotePrefix: '  '
    });

    expect(documentNumber).toBe('DN20260601');
    expect(nextSequenceMock).toHaveBeenCalledWith('deliveryNotes:202606', undefined);
  });
});
