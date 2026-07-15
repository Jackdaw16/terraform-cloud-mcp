import type {
  JsonApiResource,
  PaginationMeta,
  PlanAttributes,
  RunAttributes,
  WorkspaceAttributes,
} from "./types.js";

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly executionMode: string | null;
  readonly terraformVersion: string | null;
  readonly autoApply: boolean;
  readonly locked: boolean;
  readonly lockedReason: string | null;
  readonly resourceCount: number | null;
  readonly workingDirectory: string | null;
  readonly tags: readonly string[];
  readonly vcsRepository: string | null;
  readonly currentRunId: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly latestChangeAt: string | null;
  readonly url: string | null;
}

export interface RunSummary {
  readonly id: string;
  readonly status: string;
  readonly message: string | null;
  readonly source: string | null;
  readonly triggerReason: string | null;
  readonly createdAt: string | null;
  readonly hasChanges: boolean | null;
  readonly autoApply: boolean;
  readonly isDestroy: boolean;
  readonly planOnly: boolean;
  readonly refreshOnly: boolean;
  readonly workspaceId: string | null;
  readonly planId: string | null;
  readonly actions: {
    readonly cancelable: boolean;
    readonly confirmable: boolean;
    readonly discardable: boolean;
    readonly forceCancelable: boolean;
  };
}

export interface PlanSummary {
  readonly id: string;
  readonly status: string;
  readonly hasChanges: boolean | null;
  readonly resourceAdditions: number;
  readonly resourceChanges: number;
  readonly resourceDestructions: number;
  readonly resourceImports: number;
  readonly actionInvocations: number;
  readonly generatedConfiguration: boolean;
  readonly executionMode: string | null;
  readonly agentName: string | null;
  readonly agentPoolName: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface PaginationSummary {
  readonly currentPage: number;
  readonly nextPage: number | null;
  readonly previousPage: number | null;
  readonly pageSize: number;
  readonly totalCount: number | null;
  readonly totalPages: number | null;
}

export function mapWorkspace(
  resource: JsonApiResource<WorkspaceAttributes>,
  baseUrl = "https://app.terraform.io",
): WorkspaceSummary {
  const attributes = resource.attributes;
  const currentRun = relationshipId(resource, "current-run");
  const selfHtml = typeof resource.links?.["self-html"] === "string" ? resource.links["self-html"] : null;

  return {
    id: resource.id,
    name: attributes.name ?? resource.id,
    description: attributes.description ?? null,
    executionMode: attributes["execution-mode"] ?? null,
    terraformVersion: attributes["terraform-version"] ?? null,
    autoApply: attributes["auto-apply"] ?? false,
    locked: attributes.locked ?? false,
    lockedReason: attributes["locked-reason"] ?? null,
    resourceCount: attributes["resource-count"] ?? null,
    workingDirectory: attributes["working-directory"] ?? null,
    tags: attributes["tag-names"] ?? [],
    vcsRepository: attributes["vcs-repo-identifier"] ?? null,
    currentRunId: currentRun,
    createdAt: attributes["created-at"] ?? null,
    updatedAt: attributes["updated-at"] ?? null,
    latestChangeAt: attributes["latest-change-at"] ?? null,
    url: selfHtml ? new URL(selfHtml, baseUrl).toString() : null,
  };
}

export function mapRun(resource: JsonApiResource<RunAttributes>): RunSummary {
  const attributes = resource.attributes;
  const actions = attributes.actions;

  return {
    id: resource.id,
    status: attributes.status ?? "unknown",
    message: attributes.message ?? null,
    source: attributes.source ?? null,
    triggerReason: attributes["trigger-reason"] ?? null,
    createdAt: attributes["created-at"] ?? null,
    hasChanges: attributes["has-changes"] ?? null,
    autoApply: attributes["auto-apply"] ?? false,
    isDestroy: attributes["is-destroy"] ?? false,
    planOnly: attributes["plan-only"] ?? false,
    refreshOnly: attributes["refresh-only"] ?? false,
    workspaceId: relationshipId(resource, "workspace"),
    planId: relationshipId(resource, "plan"),
    actions: {
      cancelable: actions?.["is-cancelable"] ?? false,
      confirmable: actions?.["is-confirmable"] ?? false,
      discardable: actions?.["is-discardable"] ?? false,
      forceCancelable: actions?.["is-force-cancelable"] ?? false,
    },
  };
}

export function mapPlan(resource: JsonApiResource<PlanAttributes>): PlanSummary {
  const attributes = resource.attributes;
  const timestamps = attributes["status-timestamps"];
  const execution = attributes["execution-details"];

  return {
    id: resource.id,
    status: attributes.status ?? "unknown",
    hasChanges: attributes["has-changes"] ?? null,
    resourceAdditions: attributes["resource-additions"] ?? 0,
    resourceChanges: attributes["resource-changes"] ?? 0,
    resourceDestructions: attributes["resource-destructions"] ?? 0,
    resourceImports: attributes["resource-imports"] ?? 0,
    actionInvocations: attributes["action-invocations"] ?? 0,
    generatedConfiguration: attributes["generated-configuration"] ?? false,
    executionMode: execution?.mode ?? null,
    agentName: execution?.["agent-name"] ?? null,
    agentPoolName: execution?.["agent-pool-name"] ?? null,
    startedAt: timestamps?.["started-at"] ?? null,
    finishedAt: timestamps?.["finished-at"] ?? null,
  };
}

export function mapPagination(meta?: PaginationMeta): PaginationSummary {
  return {
    currentPage: meta?.["current-page"] ?? 1,
    nextPage: meta?.["next-page"] ?? null,
    previousPage: meta?.["prev-page"] ?? null,
    pageSize: meta?.["page-size"] ?? 20,
    totalCount: meta?.["total-count"] ?? null,
    totalPages: meta?.["total-pages"] ?? null,
  };
}

function relationshipId<TAttributes>(
  resource: JsonApiResource<TAttributes>,
  relationshipName: string,
): string | null {
  const data = resource.relationships?.[relationshipName]?.data;
  return isResourceIdentifier(data) ? data.id : null;
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
