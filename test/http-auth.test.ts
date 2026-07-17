import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/http/app.js";

describe("HTTP auth", () => {
  let oauthFixture: OAuthFixture | undefined;

  beforeEach(async () => {
    oauthFixture = await createOAuthFixture();
  });

  afterEach(async () => {
    await oauthFixture?.close();
    oauthFixture = undefined;
  });

  it("keeps /health public and exposes protected-resource metadata", async () => {
    const fixture = requireOAuthFixture(oauthFixture);
    const app = createApp(createConfig({ oauthIssuerUrl: fixture.issuerUrl }), {} as never);

    await withServer(app, async (baseUrl) => {
      const healthResponse = await fetch(`${baseUrl}/health`);
      expect(healthResponse.status).toBe(200);

      const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
      expect(metadataResponse.status).toBe(200);
      await expect(metadataResponse.json()).resolves.toMatchObject({
        resource: "https://mcp.example.com/mcp",
        authorization_servers: [fixture.issuerUrl],
        scopes_supported: ["terraform:read"],
      });
    });
  });

  it("returns 401 with OAuth metadata challenge when /mcp has no credentials", async () => {
    const fixture = requireOAuthFixture(oauthFixture);
    const app = createApp(createConfig({ oauthIssuerUrl: fixture.issuerUrl }), {} as never);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
      );
    });
  });

  it("accepts X-API-Key for non-interactive clients", async () => {
    const fixture = requireOAuthFixture(oauthFixture);
    const app = createApp(createConfig({ oauthIssuerUrl: fixture.issuerUrl, apiKeyEnabled: true }), {} as never);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`, {
        headers: { "x-api-key": "super-secret-api-key" },
      });

      expect(response.status).toBe(405);
    });
  });

  it("accepts a valid OAuth access token with the required scope", async () => {
    const fixture = requireOAuthFixture(oauthFixture);
    const token = await fixture.sign("user-1", "terraform:read");
    const app = createApp(createConfig({ oauthIssuerUrl: fixture.issuerUrl }), {} as never);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`, {
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(405);
    });
  });

  it("rejects OAuth tokens without the required scope or allowed subject", async () => {
    const fixture = requireOAuthFixture(oauthFixture);
    const missingScopeToken = await fixture.sign("user-1", "profile");
    const disallowedSubjectToken = await fixture.sign("user-2", "terraform:read");
    const app = createApp(
      createConfig({
        oauthIssuerUrl: fixture.issuerUrl,
        oauthAllowedSubjects: new Set(["user-1"]),
      }),
      {} as never,
    );

    await withServer(app, async (baseUrl) => {
      const scopeResponse = await fetch(`${baseUrl}/mcp`, {
        headers: { authorization: `Bearer ${missingScopeToken}` },
      });
      expect(scopeResponse.status).toBe(401);

      const subjectResponse = await fetch(`${baseUrl}/mcp`, {
        headers: { authorization: `Bearer ${disallowedSubjectToken}` },
      });
      expect(subjectResponse.status).toBe(401);
    });
  });
});

interface OAuthFixture {
  readonly issuerUrl: string;
  readonly close: () => Promise<void>;
  readonly sign: (sub: string, scope: string) => Promise<string>;
}

function createConfig(overrides?: {
  oauthIssuerUrl?: string;
  oauthAllowedSubjects?: ReadonlySet<string>;
  apiKeyEnabled?: boolean;
}): AppConfig {
  return {
    port: 3000,
    publicBaseUrl: "https://mcp.example.com",
    terraformApiBaseUrl: "https://app.terraform.io/api/v2",
    terraformApiToken: "terraform-token",
    defaultOrganization: "example-org",
    allowedOrganizations: new Set(["example-org"]),
    auth: {
      oauthEnabled: true,
      apiKeyEnabled: overrides?.apiKeyEnabled ?? false,
      oauthIssuerUrl: overrides?.oauthIssuerUrl,
      oauthAudience: "https://terraform-cloud-mcp",
      oauthRequiredScopes: ["terraform:read"],
      ...(overrides?.oauthAllowedSubjects ? { oauthAllowedSubjects: overrides.oauthAllowedSubjects } : {}),
      ...(overrides?.apiKeyEnabled ? { apiKeySecret: "super-secret-api-key" } : {}),
      metadataUrl: "https://mcp.example.com/.well-known/oauth-protected-resource",
    },
    requestTimeoutMs: 15000,
  };
}

function requireOAuthFixture(fixture: OAuthFixture | undefined): OAuthFixture {
  if (!fixture) {
    throw new Error("OAuth test fixture was not initialized");
  }
  return fixture;
}

async function withServer(
  app: ReturnType<typeof createApp>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0);
  try {
    await onceListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not resolve test server address");
    }

    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function createOAuthFixture(): Promise<OAuthFixture> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/.well-known/jwks.json") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }] }));
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  server.listen(0);
  await onceListening(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve OAuth server address");
  }

  const issuerUrl = `http://127.0.0.1:${address.port}/`;

  return {
    issuerUrl,
    close: () => closeServer(server),
    sign: (sub: string, scope: string) =>
      new SignJWT({ scope })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(issuerUrl)
        .setAudience("https://terraform-cloud-mcp")
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
  };
}

function onceListening(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
