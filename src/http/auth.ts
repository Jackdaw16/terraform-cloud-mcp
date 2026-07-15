import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function createBearerAuthMiddleware(expectedToken?: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!expectedToken) {
      next();
      return;
    }

    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!safeEqual(token, expectedToken)) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  };
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
