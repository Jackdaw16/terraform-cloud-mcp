export interface ResourceIdentifier {
  readonly id: string;
  readonly type: string;
}

export interface JsonApiRelationship {
  readonly data?: ResourceIdentifier | readonly ResourceIdentifier[] | null;
  readonly links?: Readonly<Record<string, unknown>>;
}

export interface JsonApiResource<TAttributes> {
  readonly id: string;
  readonly type: string;
  readonly attributes: TAttributes;
  readonly relationships?: Readonly<Record<string, JsonApiRelationship>>;
  readonly links?: Readonly<Record<string, unknown>>;
}

export interface PaginationMeta {
  readonly "current-page"?: number;
  readonly "next-page"?: number | null;
  readonly "prev-page"?: number | null;
  readonly "page-size"?: number;
  readonly "total-count"?: number;
  readonly "total-pages"?: number;
}

export interface JsonApiSingleResponse<TAttributes> {
  readonly data: JsonApiResource<TAttributes>;
}

export interface JsonApiListResponse<TAttributes> {
  readonly data: readonly JsonApiResource<TAttributes>[];
  readonly meta?: {
    readonly pagination?: PaginationMeta;
  };
}

export interface TerraformApiErrorItem {
  readonly status?: string;
  readonly title?: string;
  readonly detail?: string;
}

export interface TerraformApiErrorDocument {
  readonly errors?: readonly TerraformApiErrorItem[];
}

export interface WorkspaceAttributes {
  readonly name?: string;
  readonly description?: string | null;
  readonly "execution-mode"?: string;
  readonly "terraform-version"?: string;
  readonly "auto-apply"?: boolean;
  readonly locked?: boolean;
  readonly "locked-reason"?: string | null;
  readonly "created-at"?: string;
  readonly "updated-at"?: string;
  readonly "latest-change-at"?: string;
  readonly "working-directory"?: string | null;
  readonly "resource-count"?: number | null;
  readonly "tag-names"?: readonly string[];
  readonly "vcs-repo-identifier"?: string | null;
  readonly "structured-run-output-enabled"?: boolean;
}

export interface RunAttributes {
  readonly status?: string;
  readonly message?: string | null;
  readonly source?: string;
  readonly "trigger-reason"?: string;
  readonly "created-at"?: string;
  readonly "has-changes"?: boolean;
  readonly "auto-apply"?: boolean;
  readonly "is-destroy"?: boolean;
  readonly "plan-only"?: boolean;
  readonly refresh?: boolean;
  readonly "refresh-only"?: boolean;
  readonly actions?: {
    readonly "is-cancelable"?: boolean;
    readonly "is-confirmable"?: boolean;
    readonly "is-discardable"?: boolean;
    readonly "is-force-cancelable"?: boolean;
  };
}

export interface PlanAttributes {
  readonly status?: string;
  readonly "has-changes"?: boolean;
  readonly "resource-additions"?: number;
  readonly "resource-changes"?: number;
  readonly "resource-destructions"?: number;
  readonly "resource-imports"?: number;
  readonly "action-invocations"?: number;
  readonly "generated-configuration"?: boolean;
  readonly "status-timestamps"?: Readonly<Record<string, string>>;
  readonly "execution-details"?: {
    readonly mode?: string;
    readonly "agent-name"?: string;
    readonly "agent-pool-name"?: string;
  };
}
