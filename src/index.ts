import { createRestApp } from './restApp';
import { loadExternalEnv } from './shared/env';
import { logger } from './shared/logger';
import { initiateDb } from './shared/persistence';

const start = async () => {
  require('dotenv').config()
  loadExternalEnv();

  const restPort = Number(process.env.REST_PORT || 8000);
  await initiateDb();

  const restApp = createRestApp();

  restApp.listen(restPort, () => {
    logger.info({ port: restPort }, 'REST API server started');
  });
};

start().catch((error) => {
  logger.error({ err: error }, 'failed to start server');
  process.exit(1);
});
