import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orderService } from '../src/modules/order/service';
import { createOpenAiClient, getOpenAiModel } from '../src/shared/openai';
import { productRepository } from '../src/modules/product/repository';
import { customersRepository } from '../src/modules/customers/repository';

vi.mock('../src/shared/openai', () => ({
  createOpenAiClient: vi.fn(),
  getOpenAiModel: vi.fn()
}));

describe('order OCR service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOpenAiModel).mockReturnValue('gpt-4.1-mini');
    vi.spyOn(productRepository, 'findByProductName').mockResolvedValue(null);
    vi.spyOn(customersRepository, 'findById').mockResolvedValue(null);
    vi.spyOn(customersRepository, 'findByCustomerName').mockResolvedValue(null);
  });

  it('parses image URLs with OpenAI and maps exact local matches into a draft', async () => {
    vi.mocked(createOpenAiClient).mockReturnValue({
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            productName: 'Widget A',
            unit: null,
            buyPrice: null,
            sellPrice: 150,
            customerId: null,
            customerName: 'Acme Co',
            dueDate: '2026-06-30',
            status: null,
            notes: ['customer name inferred from header']
          }
        })
      }
    } as never);

    vi.spyOn(productRepository, 'findByProductName').mockResolvedValue({
      _id: { toString: () => '507f1f77bcf86cd799439011' }
    , productName: 'Widget A',
      unit: 'pcs',
      defaultBuyPrice: 100,
      sellPrice: 150,
      status: 'active'
    } as never);
    vi.spyOn(customersRepository, 'findByCustomerName').mockResolvedValue({
      customerId: 99,
      customerName: 'Acme Co'
    } as never);

    const result = await orderService.parseOrderImageUrls([
      'https://example.com/order-1.jpg',
      'https://example.com/order-2.jpg'
    ]);

    expect(result.imageUrls).toEqual([
      'https://example.com/order-1.jpg',
      'https://example.com/order-2.jpg'
    ]);
    expect(result.extracted).toEqual({
      productName: 'Widget A',
      unit: undefined,
      buyPrice: undefined,
      sellPrice: 150,
      customerId: undefined,
      customerName: 'Acme Co',
      dueDate: '2026-06-30',
      deliveryDate: '2026-06-30',
      status: undefined,
      notes: ['customer name inferred from header']
    });
    expect(result.draft).toEqual({
      productId: '507f1f77bcf86cd799439011',
      productName: 'Widget A',
      unit: 'pcs',
      buyPrice: 100,
      sellPrice: 150,
      customerId: 99,
      dueDate: '2026-06-30',
      deliveryDate: '2026-06-30',
      status: 'draft'
    });
    expect(result.matches.customer).toEqual({
      customerId: 99,
      customerName: 'Acme Co'
    });
  });

  it('fails when OpenAI does not return parsed structured output', async () => {
    vi.mocked(createOpenAiClient).mockReturnValue({
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: null
        })
      }
    } as never);

    await expect(orderService.parseOrderImageUrls(['https://example.com/order.jpg'])).rejects.toThrow(
      'OpenAI OCR did not return a structured order draft'
    );
  });
});
