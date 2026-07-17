import * as z from "zod/v4";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_BASE_URL: z.url(),
  TERRAFORM_API_BASE_URL: z.url().default("https://app.terraform.io/api/v2"),
  TERRAFORM_API_TOKEN: z.string().min(1, "TERRAFORM_API_TOKEN is required"),
  TERRAFORM_ORGANIZATION: z.string().min(1, "TERRAFORM_ORGANIZATION is required"),
  TERRAFORM_ALLOWED_ORGANIZATIONS: z.string().optional(),
  AUTH_OAUTH_ENABLED: z.stringbool().default(true),
  AUTH_API_KEY_ENABLED: z.stringbool().default(false),
  OAUTH_ISSUER_URL: z.url().optional(),
  OAUTH_AUDIENCE: z.string().min(1).optional(),
  OAUTH_REQUIRED_SCOPES: z.string().default("terraform:read"),
  OAUTH_ALLOWED_SUBJECTS: z.string().optional(),
  MCP_API_KEY_SECRET: z.string().min(16).optional().or(z.literal("")),
  MCP_BEARER_TOKEN: z.string().min(16).optional().or(z.literal("")),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
});

export interface AppConfig {
  readonly port: number;
  readonly publicBaseUrl: string;
  readonly terraformApiBaseUrl: string;
  readonly terraformApiToken: string;
  readonly defaultOrganization: string;
  readonly allowedOrganizations: ReadonlySet<string>;
  readonly auth: {
    readonly oauthEnabled: boolean;
    readonly apiKeyEnabled: boolean;
    readonly oauthIssuerUrl?: string;
    readonly oauthAudience?: string;
    readonly oauthRequiredScopes: readonly string[];
    readonly oauthAllowedSubjects?: ReadonlySet<string>;
    readonly apiKeySecret?: string;
    readonly metadataUrl: string;
  };
  readonly mcpBearerToken?: string;
  readonly requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const publicBaseUrl = parsed.PUBLIC_BASE_URL.replace(/\/$/, "");
  const allowedOrganizations = new Set(splitEnvList(parsed.TERRAFORM_ALLOWED_ORGANIZATIONS ?? parsed.TERRAFORM_ORGANIZATION));
  const oauthRequiredScopes = splitEnvList(parsed.OAUTH_REQUIRED_SCOPES);
  const oauthAllowedSubjects = splitEnvList(parsed.OAUTH_ALLOWED_SUBJECTS);

  if (parsed.AUTH_OAUTH_ENABLED) {
    if (!parsed.OAUTH_ISSUER_URL) {
      throw new Error("OAUTH_ISSUER_URL is required when AUTH_OAUTH_ENABLED=true");
    }
    if (!parsed.OAUTH_AUDIENCE) {
      throw new Error("OAUTH_AUDIENCE is required when AUTH_OAUTH_ENABLED=true");
    }
    if (oauthRequiredScopes.length === 0) {
      throw new Error("OAUTH_REQUIRED_SCOPES must define at least one scope when AUTH_OAUTH_ENABLED=true");
    }
  }

  if (parsed.AUTH_API_KEY_ENABLED && !parsed.MCP_API_KEY_SECRET) {
    throw new Error("MCP_API_KEY_SECRET is required when AUTH_API_KEY_ENABLED=true");
  }

  return {
    port: parsed.PORT,
    publicBaseUrl,
    terraformApiBaseUrl: parsed.TERRAFORM_API_BASE_URL.replace(/\/$/, ""),
    terraformApiToken: parsed.TERRAFORM_API_TOKEN,
    defaultOrganization: parsed.TERRAFORM_ORGANIZATION,
    allowedOrganizations,
    auth: {
      oauthEnabled: parsed.AUTH_OAUTH_ENABLED,
      apiKeyEnabled: parsed.AUTH_API_KEY_ENABLED,
      ...(parsed.OAUTH_ISSUER_URL ? { oauthIssuerUrl: normalizeIssuerUrl(parsed.OAUTH_ISSUER_URL) } : {}),
      ...(parsed.OAUTH_AUDIENCE ? { oauthAudience: parsed.OAUTH_AUDIENCE } : {}),
      oauthRequiredScopes,
      ...(oauthAllowedSubjects.length > 0 ? { oauthAllowedSubjects: new Set(oauthAllowedSubjects) } : {}),
      ...(parsed.MCP_API_KEY_SECRET ? { apiKeySecret: parsed.MCP_API_KEY_SECRET } : {}),
      metadataUrl: `${publicBaseUrl}/.well-known/oauth-protected-resource`,
    },
    ...(parsed.MCP_BEARER_TOKEN ? { mcpBearerToken: parsed.MCP_BEARER_TOKEN } : {}),
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  };
}

function splitEnvList(value?: string): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIssuerUrl(value: string): string {
  return `${value.replace(/\/+$/, "")}/`;
}
