import OpenAI from 'openai';
import { InternalServerError } from './errors';

export type OpenAiRuntimeConfig = {
  apiKey: string;
  model?: string;
  baseURL?: string;
  organization?: string;
  project?: string;
};

const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

export const isOpenAiConfigured = () => Boolean(readOptionalEnv('OPENAI_SECRET'));

export const getOpenAiRuntimeConfig = (): OpenAiRuntimeConfig => {
  const apiKey = readOptionalEnv('OPENAI_SECRET');
  if (!apiKey) {
    throw new InternalServerError('OPENAI_SECRET is required');
  }

  return {
    apiKey,
    model: readOptionalEnv('OPENAI_MODEL'),
    baseURL: readOptionalEnv('OPENAI_BASE_URL'),
    organization: readOptionalEnv('OPENAI_ORGANIZATION'),
    project: readOptionalEnv('OPENAI_PROJECT')
  };
};

export const createOpenAiClient = () => {
  const config = getOpenAiRuntimeConfig();

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
    project: config.project
  });
};

export const getOpenAiModel = () => {
  return getOpenAiRuntimeConfig().model || 'gpt-4.1-mini';
};
