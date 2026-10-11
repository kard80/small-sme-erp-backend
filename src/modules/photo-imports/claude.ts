import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '../../shared/env';
import { ImageType, ClaudeLines, claudeLinesSchema } from './schemas';

const model = 'claude-sonnet-5-5';
const toolName = 'record_order_lines';

const instructions = `You read a photographed customer order list (handwritten or printed) and match each line to the product catalog below.

Rules:
- Match ONLY to product ids that appear in the catalog. Never invent an id. Use productId null when there is no real match.
- rawText is the line copied verbatim from the image.
- qty and unit are exactly as written. Never convert units.
- Give your best guess plus up to 2 alternative catalog products, and a confidence of high, medium or low.
- Call the ${toolName} tool exactly once with every line you can read, in order.

Catalog, one product per line as: id | name | unit
`;

const tool: Anthropic.Tool = {
  name: toolName,
  description: 'Record the order lines read from the photo, matched to the catalog.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rawText', 'qty', 'unit', 'productId', 'confidence', 'alternatives'],
          properties: {
            rawText: { type: 'string', maxLength: 300 },
            qty: { type: 'number' },
            unit: { type: 'string', maxLength: 50 },
            productId: { type: ['string', 'null'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['productId'],
                properties: { productId: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }
};

let client: Anthropic | undefined;
// 120s x (1 retry + 1) bounds a call at ~4 min; keep the stale cutoff in service.ts above that.
const getClient = () => (client ??= new Anthropic({ apiKey: getAnthropicApiKey(), timeout: 120_000, maxRetries: 1 }));

export const readOrderLines = async (
  image: Buffer,
  mediaType: ImageType,
  catalogText: string
): Promise<ClaudeLines> => {
  // claude-sonnet-5-5 rejects forced tool_choice, so tool_choice stays auto and the prompt demands the call.
  const response = await getClient().messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: instructions + catalogText, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
          { type: 'text', text: `Read this order list and call ${toolName}.` }
        ]
      }
    ]
  });

  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!block || block.type !== 'tool_use') {
    throw new Error(`Claude returned no tool call (stop_reason: ${response.stop_reason})`);
  }
  return claudeLinesSchema.parse(block.input);
};
