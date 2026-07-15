import type { TerraformApiErrorDocument } from "./types.js";

export class TerraformApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TerraformApiError";
  }
}

export function parseTerraformApiError(status: number, body: unknown): TerraformApiError {
  const document = body as TerraformApiErrorDocument;
  const details = document.errors
    ?.map((error) => error.detail ?? error.title)
    .filter((value): value is string => Boolean(value))
    .join("; ");

  const message = details || `HCP Terraform API request failed with HTTP ${status}`;
  return new TerraformApiError(message, status, `terraform_http_${status}`);
}
