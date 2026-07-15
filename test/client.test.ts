import { describe, expect, it, vi } from "vitest";
import { TerraformCloudClient } from "../src/terraform/client.js";
import type { TerraformApiError } from "../src/terraform/errors.js";

function createClient(fetchImplementation: typeof fetch) {
  return new TerraformCloudClient({
    baseUrl: "https://app.terraform.io/api/v2",
    token: "secret-token",
    timeoutMs: 5000,
    allowedOrganizations: new Set(["allowed-org"]),
    fetchImplementation,
  });
}

describe("TerraformCloudClient", () => {
  it("adds authentication and encodes workspace filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/vnd.api+json" },
      }),
    );
    const client = createClient(fetchMock);

    await client.listWorkspaces({
      organization: "allowed-org",
      searchName: "api school",
      page: 2,
      pageSize: 10,
      sort: "name",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requestedUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : (url?.url ?? "");
    expect(requestedUrl).toContain("search%5Bname%5D=api+school");
    expect(requestedUrl).toContain("page%5Bnumber%5D=2");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-token");
  });

  it("rejects organizations outside the allowlist before calling the API", () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createClient(fetchMock);

    expect(() => client.listWorkspaces({ organization: "blocked-org" })).toThrowError(
      expect.objectContaining({
        code: "organization_not_allowed",
        status: 403,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects workspace IDs that resolve to a non-allowlisted organization", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "ws-blocked",
            type: "workspaces",
            attributes: { name: "blocked" },
            relationships: {
              organization: { data: { id: "blocked-org", type: "organizations" } },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/vnd.api+json" } },
      ),
    );
    const client = createClient(fetchMock);

    await expect(client.getWorkspaceById("ws-blocked")).rejects.toMatchObject({
      code: "organization_not_allowed",
      status: 403,
    });
  });

  it("normalizes Terraform JSON API errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ detail: "Run not found" }] }), {
        status: 404,
        headers: { "content-type": "application/vnd.api+json" },
      }),
    );
    const client = createClient(fetchMock);

    await expect(client.getRun("run-missing")).rejects.toEqual(
      expect.objectContaining<TerraformApiError>({
        message: "Run not found",
        status: 404,
        code: "terraform_http_404",
      }),
    );
  });
});
