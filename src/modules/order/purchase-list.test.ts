import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { buildPurchaseListHtml, groupItemsBySupplier, mergeItemsByProduct } from './purchase-list';

const id = () => new Types.ObjectId();
const [p1, p2, p3, sA, sB, sDel] = [id(), id(), id(), id(), id(), id()];
const item = (productId: Types.ObjectId, productName: string) =>
  ({ productId, productName, quantity: 2, unit: 'kg', buyPrice: 10 }) as never;
const link = (productId: Types.ObjectId, supplierId: Types.ObjectId, priority: number) =>
  ({ productId, supplierId, priority }) as never;
const sup = (_id: Types.ObjectId, supplierName: string) => ({ _id, supplierName }) as never;

describe('groupItemsBySupplier', () => {
  it('uses lowest priority supplier, skips deleted ones, thai-sorts, puts unassigned last', () => {
    const groups = groupItemsBySupplier(
      [item(p1, 'a'), item(p2, 'b'), item(p3, 'c')],
      [link(p1, sDel, 1), link(p1, sB, 2), link(p1, sA, 3), link(p2, sA, 1)],
      [sup(sA, 'ข'), sup(sB, 'ก')]
    );
    expect(groups.map((g) => [g.supplierName, g.items.map((i) => i.productName)])).toEqual([
      ['ก', ['a']],
      ['ข', ['b']],
      ['ไม่มีชื่อผู้ขาย', ['c']]
    ]);
  });
});

describe('buildPurchaseListHtml', () => {
  it('has header, note and cost columns, no sell price', () => {
    const html = buildPurchaseListHtml(
      { _id: id(), customerBillName: '<x>', deliveryDate: new Date('2026-01-31') } as never,
      groupItemsBySupplier([item(p1, 'a')], [], [])
    );
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('หมายเหตุ');
    expect(html.indexOf('ลำดับที่')).toBeLessThan(html.indexOf('สินค้า</th>'));
    expect(html).toContain('ต้นทุน');
    expect(html).toContain('10.00');
    expect(buildPurchaseListHtml({ _id: id(), customerBillName: 'x', deliveryDate: new Date() } as never, groupItemsBySupplier([{ ...(item(p1, 'a') as object), buyPrice: 0 } as never], [], []))).toContain('<td class="num">-</td>');
    expect(html).not.toMatch(/ราคา/);
  });
});

describe('mergeItemsByProduct', () => {
  it('sums quantity for the same product and unit only', () => {
    const item = (productId: string, unit: string, quantity: number) => ({ productId, unit, quantity }) as never;
    const merged = mergeItemsByProduct([item('a', 'kg', 1), item('a', 'kg', 2), item('a', 'box', 5), item('b', 'kg', 1)]);
    expect(merged.map((i) => [i.productId, i.unit, i.quantity])).toEqual([['a', 'kg', 3], ['a', 'box', 5], ['b', 'kg', 1]]);
  });
});
