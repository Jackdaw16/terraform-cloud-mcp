import * as z from "zod/v4";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TERRAFORM_API_BASE_URL: z.url().default("https://app.terraform.io/api/v2"),
  TERRAFORM_API_TOKEN: z.string().min(1, "TERRAFORM_API_TOKEN is required"),
  TERRAFORM_ORGANIZATION: z.string().min(1, "TERRAFORM_ORGANIZATION is required"),
  TERRAFORM_ALLOWED_ORGANIZATIONS: z.string().optional(),
  MCP_BEARER_TOKEN: z.string().min(16).optional().or(z.literal("")),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
});

export interface AppConfig {
  readonly port: number;
  readonly terraformApiBaseUrl: string;
  readonly terraformApiToken: string;
  readonly defaultOrganization: string;
  readonly allowedOrganizations: ReadonlySet<string>;
  readonly mcpBearerToken?: string;
  readonly requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const allowedOrganizations = new Set(
    (parsed.TERRAFORM_ALLOWED_ORGANIZATIONS ?? parsed.TERRAFORM_ORGANIZATION)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return {
    port: parsed.PORT,
    terraformApiBaseUrl: parsed.TERRAFORM_API_BASE_URL.replace(/\/$/, ""),
    terraformApiToken: parsed.TERRAFORM_API_TOKEN,
    defaultOrganization: parsed.TERRAFORM_ORGANIZATION,
    allowedOrganizations,
    ...(parsed.MCP_BEARER_TOKEN ? { mcpBearerToken: parsed.MCP_BEARER_TOKEN } : {}),
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  };
}
