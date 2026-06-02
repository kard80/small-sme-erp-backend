import { createRestApp } from './restApp';
import { loadExternalEnv } from './shared/env';
import { initiateDb } from './shared/persistence';

const start = async () => {
  require('dotenv').config()
  loadExternalEnv();

  const restPort = Number(process.env.REST_PORT || 8000);
  await initiateDb();

  const restApp = createRestApp();

  restApp.listen(restPort, () => {
    console.log(`REST API server running on port ${restPort} using mongodb persistence`);
  });
};

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
