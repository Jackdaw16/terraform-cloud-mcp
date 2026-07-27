import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, errors as joseErrors, jwtVerify } from "jose";
import type { AppConfig } from "../config.js";

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly scopes_supported: readonly string[];
  readonly api_key_methods_supported: readonly string[];
}

type AuthResult =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly category: RejectionCategory;
    readonly error: "invalid_token" | "insufficient_scope";
  };

type RejectionCategory = "signature" | "issuer" | "audience" | "expiration" | "subject" | "scopes";

interface TokenDiagnostics {
  readonly alg?: string;
  readonly kid?: string;
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly sub?: string;
  readonly scope?: string;
  readonly exp?: number;
}

export function createAuthMiddleware(config: AppConfig) {
  const oauthVerifier = config.auth.oauthEnabled ? createOAuthAccessTokenVerifier(config) : undefined;

  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const apiKey = request.header("x-api-key") ?? "";
    if (config.auth.apiKeyEnabled &&
      config.auth.apiKeySecret &&
      safeEqual(apiKey, config.auth.apiKeySecret)) {
      next();
      return;
    }

    const authorization = request.header("authorization");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

    if (oauthVerifier && bearerToken) {
      const authResult = await oauthVerifier(bearerToken);
      if (authResult.ok) {
        next();
        return;
      }

      if (authResult.error === "insufficient_scope") {
        sendForbidden(response, config);
        return;
      }

      sendUnauthorized(response, config, "invalid_token");
      return;
    }

    sendUnauthorized(response, config, bearerToken ? "invalid_token" : undefined);
  };
}

export function createProtectedResourceMetadata(config: AppConfig): ProtectedResourceMetadata {
  return {
    resource: config.auth.oauthAudience,
    authorization_servers: config.auth.oauthIssuerUrl ? [config.auth.oauthIssuerUrl] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: [...config.auth.oauthRequiredScopes],
    api_key_methods_supported: config.auth.apiKeyEnabled ? ["header:x-api-key"] : [],
  };
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function createOAuthAccessTokenVerifier(config: AppConfig) {
  const issuer = config.auth.oauthIssuerUrl;
  const audience = config.auth.oauthAudience;
  if (!issuer) {
    throw new Error("OAuth verification is enabled but issuer is missing");
  }

  const jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", issuer));
  const requiredScopes = new Set(config.auth.oauthRequiredScopes);
  const allowedSubjects = config.auth.oauthAllowedSubjects;

  return async (token: string): Promise<AuthResult> => {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, jwks, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp"],
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        logOAuthRejection(config, "subject", {
          ...createVerifiedTokenDiagnostics(payload, protectedHeader),
          rejectionReason: "missing or empty subject",
        });
        return { ok: false, category: "subject", error: "invalid_token" };
      }

      if (allowedSubjects && !allowedSubjects.has(payload.sub)) {
        logOAuthRejection(config, "subject", {
          ...createVerifiedTokenDiagnostics(payload, protectedHeader),
          rejectionReason: "subject not allowlisted",
        });
        return { ok: false, category: "subject", error: "invalid_token" };
      }

      const grantedScopes = new Set(splitScopes(payload.scope));
      const missingScopes = [...requiredScopes].filter((scope) => !grantedScopes.has(scope));
      if (missingScopes.length > 0) {
        logOAuthRejection(config, "scopes", {
          ...createVerifiedTokenDiagnostics(payload, protectedHeader),
          missingScopes,
          rejectionReason: "missing required scope",
        });
        return { ok: false, category: "scopes", error: "insufficient_scope" };
      }

      return { ok: true };
    } catch (error: unknown) {
      const category = categorizeJwtVerifyError(error);
      logOAuthRejection(config, category, {
        ...decodeTokenDiagnostics(token),
        errorCode: getErrorCode(error),
        errorMessage: getErrorMessage(error),
        rejectionReason: getRejectionReason(error),
      });
      return { ok: false, category, error: "invalid_token" };
    }
  };
}

function splitScopes(scope: unknown): string[] {
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
}

function createVerifiedTokenDiagnostics(payload: { [key: string]: unknown }, protectedHeader: { [key: string]: unknown }): TokenDiagnostics {
  return {
    alg: typeof protectedHeader.alg === "string" ? protectedHeader.alg : undefined,
    kid: typeof protectedHeader.kid === "string" ? protectedHeader.kid : undefined,
    iss: typeof payload.iss === "string" ? payload.iss : undefined,
    aud: normalizeAudience(payload.aud),
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

function normalizeAudience(value: unknown): string | readonly string[] | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  return undefined;
}

function decodeTokenDiagnostics(token: string): TokenDiagnostics {
  const protectedHeader = tryDecodeProtectedHeader(token);
  const payload = tryDecodeJwt(token);

  return createVerifiedTokenDiagnostics(payload, protectedHeader);
}

function tryDecodeProtectedHeader(token: string): { [key: string]: unknown } {
  try {
    return decodeProtectedHeader(token);
  } catch {
    return {};
  }
}

function tryDecodeJwt(token: string): { [key: string]: unknown } {
  try {
    return decodeJwt(token);
  } catch {
    return {};
  }
}

function categorizeJwtVerifyError(error: unknown): RejectionCategory {
  if (error instanceof joseErrors.JWTExpired) {
    return "expiration";
  }

  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    switch (error.claim) {
      case "iss":
        return "issuer";
      case "aud":
        return "audience";
      case "sub":
        return "subject";
      case "exp":
      case "nbf":
      case "iat":
        return "expiration";
      default:
        return "signature";
    }
  }

  return "signature";
}

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function getRejectionReason(error: unknown): string | undefined {
  if (error instanceof joseErrors.JWTClaimValidationFailed || error instanceof joseErrors.JWTExpired) {
    return `${error.claim}:${error.reason}`;
  }

  return getErrorMessage(error);
}

function logOAuthRejection(
  config: AppConfig,
  category: RejectionCategory,
  details: TokenDiagnostics & {
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly missingScopes?: readonly string[];
    readonly rejectionReason?: string;
  },
): void {
  console.warn("OAuth access token rejected", {
    rejectionCategory: category,
    rejectionReason: details.rejectionReason,
    errorCode: details.errorCode,
    errorMessage: details.errorMessage,
    token: {
      alg: details.alg,
      kid: details.kid,
      iss: details.iss,
      aud: details.aud,
      sub: details.sub,
      scope: details.scope,
      exp: details.exp,
    },
    expectedIssuer: config.auth.oauthIssuerUrl,
    expectedAudience: config.auth.oauthAudience,
    expectedScopes: config.auth.oauthRequiredScopes,
    allowedSubjects: config.auth.oauthAllowedSubjects ? [...config.auth.oauthAllowedSubjects] : [],
    missingScopes: details.missingScopes,
  });
}

function sendUnauthorized(response: Response, config: AppConfig, error?: "invalid_token") {
  const params = [
    'Bearer realm="terraform-cloud-mcp"',
    `resource_metadata="${config.auth.metadataUrl}"`,
    ...(config.auth.oauthRequiredScopes.length > 0 ? [`scope="${config.auth.oauthRequiredScopes.join(" ")}"`] : []),
    ...(error ? [`error="${error}"`] : []),
  ];

  response.setHeader("WWW-Authenticate", params.join(", "));
  response.status(401).json({ error: "unauthorized" });
}

function sendForbidden(response: Response, config: AppConfig) {
  const params = [
    'Bearer realm="terraform-cloud-mcp"',
    `resource_metadata="${config.auth.metadataUrl}"`,
    ...(config.auth.oauthRequiredScopes.length > 0 ? [`scope="${config.auth.oauthRequiredScopes.join(" ")}"`] : []),
    'error="insufficient_scope"',
  ];

  response.setHeader("WWW-Authenticate", params.join(", "));
  response.status(403).json({ error: "forbidden" });
}
