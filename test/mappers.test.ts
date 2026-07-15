import { describe, expect, it } from "vitest";
import { mapPlan, mapRun, mapWorkspace } from "../src/terraform/mappers.js";

describe("Terraform response mappers", () => {
  it("maps only operational workspace fields", () => {
    const workspace = mapWorkspace({
      id: "ws-123",
      type: "workspaces",
      attributes: {
        name: "job-board-infra",
        "terraform-version": "1.9.4",
        "resource-count": 8,
        locked: false,
      },
      relationships: {
        "current-run": { data: { id: "run-123", type: "runs" } },
      },
      links: { "self-html": "/app/example/workspaces/job-board-infra" },
    });

    expect(workspace).toMatchObject({
      id: "ws-123",
      name: "job-board-infra",
      currentRunId: "run-123",
      resourceCount: 8,
    });
    expect(JSON.stringify(workspace)).not.toContain("token");
  });

  it("maps a run and plan without log URLs or raw plan data", () => {
    const run = mapRun({
      id: "run-123",
      type: "runs",
      attributes: { status: "planned", "has-changes": true },
      relationships: {
        plan: { data: { id: "plan-123", type: "plans" } },
        workspace: { data: { id: "ws-123", type: "workspaces" } },
      },
    });
    const plan = mapPlan({
      id: "plan-123",
      type: "plans",
      attributes: {
        status: "finished",
        "resource-additions": 2,
        "resource-changes": 1,
        "resource-destructions": 0,
      },
    });

    expect(run.planId).toBe("plan-123");
    expect(plan).toMatchObject({ resourceAdditions: 2, resourceChanges: 1, resourceDestructions: 0 });
    expect(JSON.stringify(plan)).not.toContain("log-read-url");
  });
});
