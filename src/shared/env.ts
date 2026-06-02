import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const envFileArgPrefix = '--env-file=';

const getEnvFilePath = () => {
  const argPath = process.argv.find((arg) => arg.startsWith(envFileArgPrefix))?.slice(envFileArgPrefix.length);
  return process.env.ENV_FILE_PATH || argPath;
};

export const loadExternalEnv = () => {
  const envFilePath = getEnvFilePath();
  if (!envFilePath) {
    return;
  }

  const resolvedPath = resolve(envFilePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${resolvedPath}`);
  }

  const result = dotenv.config({
    path: resolvedPath,
    override: false
  });

  if (result.error) {
    throw result.error;
  }
};
