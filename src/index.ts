import { createRestApp } from './restApp';
import { loadExternalEnv } from './shared/env';
import { logger } from './shared/logger';
import { initiateDb } from './shared/persistence';
import { photoImportsService } from './modules/photo-imports/service';

const start = async () => {
  require('dotenv').config()
  loadExternalEnv();
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    logger.warn('ANTHROPIC_API_KEY is not set: photo imports will fail until it is configured');
  }
  await initiateDb();
  await photoImportsService.failInterrupted().catch((err) => logger.error({ err }, 'photo import sweep failed'));

  const restPort = Number(process.env.PORT || 8080);
  const restApp = createRestApp();

  restApp.listen(restPort, () => {
    logger.info({ port: restPort }, 'REST API server started');
  });

};

start().catch((error) => {
  logger.error({ err: error }, 'failed to start server');
  process.exit(1);
});
