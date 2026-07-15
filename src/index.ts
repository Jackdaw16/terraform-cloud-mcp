import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { TerraformCloudClient } from "./terraform/client.js";

const config = loadConfig();
const client = new TerraformCloudClient({
  baseUrl: config.terraformApiBaseUrl,
  token: config.terraformApiToken,
  timeoutMs: config.requestTimeoutMs,
  allowedOrganizations: config.allowedOrganizations,
});
const app = createApp(config, client);

const server = app.listen(config.port, () => {
  console.log(`terraform-cloud-mcp listening on port ${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down`);
  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
