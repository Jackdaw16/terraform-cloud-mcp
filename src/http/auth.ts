import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppConfig } from "../config.js";

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly scopes_supported: readonly string[];
  readonly api_key_methods_supported: readonly string[];
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
      const authenticated = await oauthVerifier(bearerToken);
      if (authenticated) {
        next();
        return;
      }
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

  return async (token: string): Promise<boolean> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp"],
      });

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        return false;
      }

      if (allowedSubjects && !allowedSubjects.has(payload.sub)) {
        return false;
      }

      const grantedScopes = new Set((typeof payload.scope === "string" ? payload.scope : "").split(/\s+/).filter(Boolean));
      return [...requiredScopes].every((scope) => grantedScopes.has(scope));
    } catch {
      return false;
    }
  };
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
