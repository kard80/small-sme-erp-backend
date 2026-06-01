import { createMcpApp } from './mcpApp';
import { createRestApp } from './restApp';

const restPort = Number(process.env.REST_PORT || 3000);
const mcpPort = Number(process.env.MCP_PORT || 3001);

const restApp = createRestApp();
const mcpApp = createMcpApp();

restApp.listen(restPort, () => {
  console.log(`REST API server running on port ${restPort}`);
});

mcpApp.listen(mcpPort, () => {
  console.log(`MCP server running on port ${mcpPort}`);
});
