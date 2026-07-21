import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppConfig } from "../config.js";
import type { TerraformCloudClient } from "../terraform/client.js";
import { createTerraformMcpServer } from "../mcp/server.js";
import { createAuthMiddleware, createProtectedResourceMetadata } from "./auth.js";

export function createApp(config: AppConfig, client: TerraformCloudClient) {
  const app = createMcpExpressApp({
    host: "0.0.0.0",
  });

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok", service: "terraform-cloud-mcp", version: "0.2.0" });
  });

  app.get("/.well-known/oauth-protected-resource", (_request, response) => {
    response.status(200).json(createProtectedResourceMetadata(config));
  });

  app.use("/mcp", createAuthMiddleware(config));

  app.post("/mcp", async (request, response) => {
    const server = createTerraformMcpServer(client, config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.get("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed in stateless mode" },
      id: null,
    });
  });

  app.delete("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed in stateless mode" },
      id: null,
    });
  });

  return app;
}
