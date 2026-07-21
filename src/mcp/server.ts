import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AppConfig } from "../config.js";
import type { TerraformCloudClient } from "../terraform/client.js";
import { mapPagination, mapPlan, mapRun, mapWorkspace } from "../terraform/mappers.js";
import { errorResult, successResult } from "./results.js";

const commonAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export function createTerraformMcpServer(client: TerraformCloudClient, config: AppConfig): McpServer {
  const server = new McpServer({
    name: "terraform-cloud-mcp",
    version: "0.1.0",
  });

  const oauthSecuritySchemes = config.auth.oauthEnabled
    ? [
        {
          type: "oauth2" as const,
          scopes: [...config.auth.oauthRequiredScopes],
        },
      ]
    : [];
  const oauthToolMetadata: Record<string, unknown> = { securitySchemes: oauthSecuritySchemes };

  server.registerTool(
    "terraform_list_workspaces",
    {
      title: "List HCP Terraform workspaces",
      description:
        "Lists workspaces in an allowed HCP Terraform organization. Use this to discover workspace IDs, lock state, Terraform versions, current runs, and resource counts.",
      inputSchema: {
        organization: z.string().min(1).optional().describe("Organization name. Defaults to the configured organization."),
        searchName: z.string().min(1).optional().describe("Optional fuzzy workspace name search."),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        sort: z
          .enum(["name", "-name", "current-run.created-at", "-current-run.created-at", "latest-change-at", "-latest-change-at"])
          .default("name"),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ organization, searchName, page, pageSize, sort }) => {
      try {
        const resolvedOrganization = organization ?? config.defaultOrganization;
        const response = await client.listWorkspaces({
          organization: resolvedOrganization,
          page,
          pageSize,
          sort,
          ...(searchName ? { searchName } : {}),
        });
        return successResult({
          organization: resolvedOrganization,
          workspaces: response.data.map((workspace) => mapWorkspace(workspace)),
          pagination: mapPagination(response.meta?.pagination),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "terraform_get_workspace",
    {
      title: "Get an HCP Terraform workspace",
      description:
        "Gets sanitized workspace details by workspace ID or by organization and workspace name. It never returns variables, state, outputs, or tokens.",
      inputSchema: {
        workspaceId: z.string().min(1).optional(),
        organization: z.string().min(1).optional(),
        workspaceName: z.string().min(1).optional(),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ workspaceId, organization, workspaceName }) => {
      try {
        if (!workspaceId && !workspaceName) {
          throw new Error("Provide workspaceId or workspaceName");
        }
        const response = workspaceId
          ? await client.getWorkspaceById(workspaceId)
          : await client.getWorkspaceByName(organization ?? config.defaultOrganization, workspaceName as string);
        return successResult({ workspace: mapWorkspace(response.data) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "terraform_list_runs",
    {
      title: "List runs in a workspace",
      description:
        "Lists recent HCP Terraform runs for a workspace, optionally filtered by status, status group, or text search. The API rate limit for this endpoint is lower, so keep page sizes focused.",
      inputSchema: {
        workspaceId: z.string().min(1),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
        status: z.string().min(1).optional().describe("Comma-separated Terraform run statuses."),
        statusGroup: z.string().min(1).optional().describe("A Terraform run status group."),
        search: z.string().min(1).optional().describe("Search run ID, message, commit SHA, or VCS user."),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ workspaceId, page, pageSize, status, statusGroup, search }) => {
      try {
        const response = await client.listRuns({
          workspaceId,
          page,
          pageSize,
          ...(status ? { status } : {}),
          ...(statusGroup ? { statusGroup } : {}),
          ...(search ? { search } : {}),
        });
        return successResult({
          workspaceId,
          runs: response.data.map(mapRun),
          pagination: mapPagination(response.meta?.pagination),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "terraform_get_run",
    {
      title: "Get an HCP Terraform run",
      description:
        "Gets a sanitized HCP Terraform run with its status, trigger, plan relationship, workspace relationship, and available actions. It does not perform any action.",
      inputSchema: {
        runId: z.string().min(1),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ runId }) => {
      try {
        const response = await client.getRun(runId);
        return successResult({ run: mapRun(response.data) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "terraform_get_run_plan_summary",
    {
      title: "Get a Terraform run plan summary",
      description:
        "Gets a run and its plan summary, including additions, changes, destructions, imports, and plan status. It deliberately excludes plan JSON, logs, state, variables, and sensitive output values.",
      inputSchema: {
        runId: z.string().min(1),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ runId }) => {
      try {
        const runResponse = await client.getRun(runId);
        const run = mapRun(runResponse.data);
        if (!run.planId) {
          return successResult({ run, plan: null, note: "This run does not expose a plan relationship yet." });
        }
        const planResponse = await client.getPlan(run.planId);
        return successResult({ run, plan: mapPlan(planResponse.data) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "terraform_get_workspace_overview",
    {
      title: "Get a Terraform workspace overview",
      description:
        "Returns a workspace plus its current run and plan summary when available. This is the preferred tool for a concise operational overview or initial diagnosis.",
      inputSchema: {
        organization: z.string().min(1).optional(),
        workspaceName: z.string().min(1),
      },
      annotations: commonAnnotations,
      _meta: oauthToolMetadata,
    },
    async ({ organization, workspaceName }) => {
      try {
        const resolvedOrganization = organization ?? config.defaultOrganization;
        const workspaceResponse = await client.getWorkspaceByName(resolvedOrganization, workspaceName);
        const workspace = mapWorkspace(workspaceResponse.data);

        if (!workspace.currentRunId) {
          return successResult({ organization: resolvedOrganization, workspace, currentRun: null, plan: null });
        }

        const runResponse = await client.getRun(workspace.currentRunId);
        const currentRun = mapRun(runResponse.data);
        const plan = currentRun.planId ? mapPlan((await client.getPlan(currentRun.planId)).data) : null;

        return successResult({ organization: resolvedOrganization, workspace, currentRun, plan });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
