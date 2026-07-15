import { TerraformApiError } from "../terraform/errors.js";

export function successResult(data: unknown) {
  const structuredContent = { success: true, data };
  return {
    structuredContent,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
  };
}

export function errorResult(error: unknown) {
  const normalized = normalizeError(error);
  const structuredContent = { success: false, error: normalized };
  return {
    isError: true,
    structuredContent,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
  };
}

function normalizeError(error: unknown): { code: string; message: string; status: number | null } {
  if (error instanceof TerraformApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { code: "internal_error", message: error.message, status: null };
  }
  return { code: "internal_error", message: "Unknown error", status: null };
}
