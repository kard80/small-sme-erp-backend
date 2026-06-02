import { createRestApp } from './restApp';

const restPort = Number(process.env.REST_PORT || 3000);

const restApp = createRestApp();

restApp.listen(restPort, () => {
  console.log(`REST API server running on port ${restPort}`);
});
