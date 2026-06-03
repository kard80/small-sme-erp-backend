import { createRestApp } from './restApp';
import { loadExternalEnv } from './shared/env';
import { logger } from './shared/logger';
import { initiateDb } from './shared/persistence';

const start = async () => {
  require('dotenv').config()
  loadExternalEnv();

  const restPort = Number(process.env.PORT || 8080);
  const restApp = createRestApp();

  await new Promise<void>((resolve) => {
    restApp.listen(restPort, () => {
      logger.info({ port: restPort }, 'REST API server started');
      resolve();
    });
  });

  await initiateDb();
};

start().catch((error) => {
  logger.error({ err: error }, 'failed to start server');
  process.exit(1);
});
