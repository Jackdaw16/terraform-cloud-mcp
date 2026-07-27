import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createTerraformMcpServer } from "../src/mcp/server.js";

describe("MCP tool metadata", () => {
  const resourcesToClose: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (resourcesToClose.length > 0) {
      const close = resourcesToClose.pop();
      if (close) {
        await close();
      }
    }
  });

  it("publishes oauth2 securitySchemes metadata for all six tools", async () => {
    const server = createTerraformMcpServer({} as never, createConfig());
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    resourcesToClose.push(() => client.close(), () => server.close());

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();

    expect(result.tools).toHaveLength(6);

    for (const tool of result.tools as Array<{ _meta?: { securitySchemes?: unknown } }>) {
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["terraform:read"] }]);
    }
  });
});

function createConfig(): AppConfig {
  return {
    port: 3000,
    publicBaseUrl: "https://mcp.example.com",
    terraformApiBaseUrl: "https://app.terraform.io/api/v2",
    terraformApiToken: "terraform-token",
    defaultOrganization: "example-org",
    allowedOrganizations: new Set(["example-org"]),
    auth: {
      oauthEnabled: true,
      apiKeyEnabled: false,
      oauthIssuerUrl: "https://tenant.us.auth0.com/",
      oauthAudience: "https://mcp.example.com/mcp",
      oauthRequiredScopes: ["terraform:read"],
      metadataUrl: "https://mcp.example.com/.well-known/oauth-protected-resource",
    },
    requestTimeoutMs: 15000,
  };
}
