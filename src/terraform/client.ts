import { parseTerraformApiError, TerraformApiError } from "./errors.js";
import type {
  JsonApiListResponse,
  JsonApiSingleResponse,
  PlanAttributes,
  RunAttributes,
  WorkspaceAttributes,
} from "./types.js";

export interface TerraformClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs: number;
  readonly allowedOrganizations: ReadonlySet<string>;
  readonly fetchImplementation?: typeof fetch;
}

export interface ListWorkspacesInput {
  readonly organization: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly searchName?: string;
  readonly sort?: "name" | "-name" | "current-run.created-at" | "-current-run.created-at" | "latest-change-at" | "-latest-change-at";
}

export interface ListRunsInput {
  readonly workspaceId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  readonly statusGroup?: string;
  readonly search?: string;
}

export class TerraformCloudClient {
  private readonly fetchImplementation: typeof fetch;

  public constructor(private readonly options: TerraformClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public assertOrganizationAllowed(organization: string): void {
    if (!this.options.allowedOrganizations.has(organization)) {
      throw new TerraformApiError(
        `Organization '${organization}' is not in TERRAFORM_ALLOWED_ORGANIZATIONS`,
        403,
        "organization_not_allowed",
      );
    }
  }

  public listWorkspaces(input: ListWorkspacesInput): Promise<JsonApiListResponse<WorkspaceAttributes>> {
    this.assertOrganizationAllowed(input.organization);
    return this.request(`/organizations/${encodeURIComponent(input.organization)}/workspaces`, {
      "page[number]": String(input.page ?? 1),
      "page[size]": String(input.pageSize ?? 20),
      ...(input.searchName ? { "search[name]": input.searchName } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
    });
  }

  public async getWorkspaceById(workspaceId: string): Promise<JsonApiSingleResponse<WorkspaceAttributes>> {
    const response = await this.request<JsonApiSingleResponse<WorkspaceAttributes>>(
      `/workspaces/${encodeURIComponent(workspaceId)}`,
    );
    this.assertWorkspaceOrganizationAllowed(response);
    return response;
  }

  public getWorkspaceByName(
    organization: string,
    workspaceName: string,
  ): Promise<JsonApiSingleResponse<WorkspaceAttributes>> {
    this.assertOrganizationAllowed(organization);
    return this.request(
      `/organizations/${encodeURIComponent(organization)}/workspaces/${encodeURIComponent(workspaceName)}`,
    );
  }

  public async listRuns(input: ListRunsInput): Promise<JsonApiListResponse<RunAttributes>> {
    await this.getWorkspaceById(input.workspaceId);
    return this.request(`/workspaces/${encodeURIComponent(input.workspaceId)}/runs`, {
      "page[number]": String(input.page ?? 1),
      "page[size]": String(input.pageSize ?? 20),
      ...(input.status ? { "filter[status]": input.status } : {}),
      ...(input.statusGroup ? { "filter[status_group]": input.statusGroup } : {}),
      ...(input.search ? { "search[basic]": input.search } : {}),
    });
  }

  public async getRun(runId: string): Promise<JsonApiSingleResponse<RunAttributes>> {
    const response = await this.request<JsonApiSingleResponse<RunAttributes>>(
      `/runs/${encodeURIComponent(runId)}`,
    );
    const workspace = response.data.relationships?.workspace?.data;
    if (!isResourceIdentifier(workspace)) {
      throw new TerraformApiError(
        `Run '${runId}' does not expose a workspace relationship`,
        502,
        "missing_workspace_relationship",
      );
    }
    await this.getWorkspaceById(workspace.id);
    return response;
  }

  public getPlan(planId: string): Promise<JsonApiSingleResponse<PlanAttributes>> {
    return this.request(`/plans/${encodeURIComponent(planId)}`);
  }

  private assertWorkspaceOrganizationAllowed(response: JsonApiSingleResponse<WorkspaceAttributes>): void {
    const organization = response.data.relationships?.organization?.data;
    if (!isResourceIdentifier(organization)) {
      throw new TerraformApiError(
        `Workspace '${response.data.id}' does not expose an organization relationship`,
        502,
        "missing_organization_relationship",
      );
    }
    this.assertOrganizationAllowed(organization.id);
  }

  private async request<T>(path: string, query?: Readonly<Record<string, string>>): Promise<T> {
    const url = new URL(`${this.options.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        signal: controller.signal,
      });

      const body = await parseResponseBody(response);
      if (!response.ok) {
        throw parseTerraformApiError(response.status, body);
      }

      return body as T;
    } catch (error) {
      if (error instanceof TerraformApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TerraformApiError(
          `HCP Terraform API request timed out after ${this.options.timeoutMs}ms`,
          504,
          "terraform_timeout",
        );
      }
      throw new TerraformApiError(
        error instanceof Error ? error.message : "Unknown HCP Terraform API error",
        502,
        "terraform_network_error",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { errors: [{ detail: text }] } : {};
}

function isResourceIdentifier(value: unknown): value is { readonly id: string; readonly type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}
