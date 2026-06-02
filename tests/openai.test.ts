import { afterEach, describe, expect, it } from 'vitest';
import { createOpenAiClient, getOpenAiModel, getOpenAiRuntimeConfig, isOpenAiConfigured } from '../src/shared/openai';

const originalEnv = {
  OPENAI_SECRET: process.env.OPENAI_SECRET,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_ORGANIZATION: process.env.OPENAI_ORGANIZATION,
  OPENAI_PROJECT: process.env.OPENAI_PROJECT
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
});

describe('openai runtime setup', () => {
  it('reports configuration state without exposing the key', () => {
    delete process.env.OPENAI_SECRET;
    expect(isOpenAiConfigured()).toBe(false);

    process.env.OPENAI_SECRET = ' sk-test ';
    expect(isOpenAiConfigured()).toBe(true);
  });

  it('returns trimmed runtime config and default model', () => {
    process.env.OPENAI_SECRET = ' sk-test ';
    process.env.OPENAI_BASE_URL = ' https://api.openai.com/v1 ';
    process.env.OPENAI_ORGANIZATION = ' org_123 ';
    process.env.OPENAI_PROJECT = ' proj_123 ';

    expect(getOpenAiRuntimeConfig()).toEqual({
      apiKey: 'sk-test',
      model: undefined,
      baseURL: 'https://api.openai.com/v1',
      organization: 'org_123',
      project: 'proj_123'
    });
    expect(getOpenAiModel()).toBe('gpt-4.1-mini');
  });

  it('builds an SDK client when the key is configured', () => {
    process.env.OPENAI_SECRET = 'sk-test';

    const client = createOpenAiClient();

    expect(client).toBeDefined();
  });

  it('throws when the API key is missing', () => {
    delete process.env.OPENAI_SECRET;

    expect(() => getOpenAiRuntimeConfig()).toThrow('OPENAI_SECRET is required');
    expect(() => createOpenAiClient()).toThrow('OPENAI_SECRET is required');
  });
});
