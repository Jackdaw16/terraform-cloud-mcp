import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses OAuth and API key settings", () => {
    const config = loadConfig({
      PORT: "3000",
      PUBLIC_BASE_URL: "https://mcp.example.com/",
      TERRAFORM_API_TOKEN: "terraform-token",
      TERRAFORM_ORGANIZATION: "example-org",
      AUTH_OAUTH_ENABLED: "true",
      OAUTH_ISSUER_URL: "https://tenant.us.auth0.com",
      OAUTH_AUDIENCE: "https://terraform-cloud-mcp",
      OAUTH_REQUIRED_SCOPES: "terraform:read terraform:admin",
      OAUTH_ALLOWED_SUBJECTS: "user-1,user-2",
      AUTH_API_KEY_ENABLED: "true",
      MCP_API_KEY_SECRET: "super-secret-api-key",
      REQUEST_TIMEOUT_MS: "15000",
    });

    expect(config.publicBaseUrl).toBe("https://mcp.example.com");
    expect(config.auth.oauthIssuerUrl).toBe("https://tenant.us.auth0.com/");
    expect(config.auth.oauthRequiredScopes).toEqual(["terraform:read", "terraform:admin"]);
    expect([...config.auth.oauthAllowedSubjects ?? []]).toEqual(["user-1", "user-2"]);
    expect(config.auth.apiKeySecret).toBe("super-secret-api-key");
    expect(config.auth.metadataUrl).toBe("https://mcp.example.com/.well-known/oauth-protected-resource");
  });

  it("requires issuer and audience when OAuth is enabled", () => {
    expect(() =>
      loadConfig({
        PORT: "3000",
        PUBLIC_BASE_URL: "https://mcp.example.com",
        TERRAFORM_API_TOKEN: "terraform-token",
        TERRAFORM_ORGANIZATION: "example-org",
        AUTH_OAUTH_ENABLED: "true",
        REQUEST_TIMEOUT_MS: "15000",
      }),
    ).toThrow("OAUTH_ISSUER_URL is required when AUTH_OAUTH_ENABLED=true");
  });
});
