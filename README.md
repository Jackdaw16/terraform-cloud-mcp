# Terraform Cloud MCP

A read-only MCP server for inspecting and diagnosing HCP Terraform (formerly Terraform Cloud) from ChatGPT and other MCP clients.

The first version is deliberately narrow: it exposes workspaces, runs, and sanitized plan summaries while excluding variables, state, outputs, raw plan JSON, logs, and every write operation.

## Capabilities

- List workspaces in an allowlisted organization.
- Inspect workspace configuration and lock state.
- List and filter workspace runs.
- Inspect one run and its available actions without executing them.
- Summarize a plan: additions, changes, destructions, imports, and status.
- Get a combined workspace/current-run/plan operational overview.

### MCP tools

| Tool | Purpose |
| --- | --- |
| `terraform_list_workspaces` | Discover workspace IDs and operational status. |
| `terraform_get_workspace` | Inspect one workspace by ID or name. |
| `terraform_list_runs` | List recent or filtered runs in a workspace. |
| `terraform_get_run` | Inspect one run. |
| `terraform_get_run_plan_summary` | Retrieve the sanitized numeric plan summary for a run. |
| `terraform_get_workspace_overview` | Retrieve a workspace, current run, and plan in one call. |

Every tool is annotated as read-only, non-destructive, and idempotent.

## Security model

This project does **not** return:

- Terraform variables or variable values.
- State files or state outputs.
- Raw plan JSON.
- Plan or apply logs.
- Terraform API tokens.
- Apply, cancel, discard, unlock, delete, or workspace-update operations.

Organizations are restricted with `TERRAFORM_ALLOWED_ORGANIZATIONS`. Use a Terraform token with the minimum permissions required to read the intended workspaces and runs.

`MCP_BEARER_TOKEN` adds optional static bearer authentication for MCP clients that can send an `Authorization` header. For direct ChatGPT testing, prefer OpenAI's Secure MCP Tunnel or add standards-compliant OAuth before exposing the service publicly. Never deploy an unauthenticated public endpoint that contains a server-side Terraform token.

## Requirements

- Node.js 22+
- An HCP Terraform user, team, or organization token with read access

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

MCP endpoint:

```text
http://localhost:3000/mcp
```

## Validate

```bash
npm run check
docker build -t terraform-cloud-mcp .
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TERRAFORM_API_TOKEN` | Yes | HCP Terraform API token. |
| `TERRAFORM_ORGANIZATION` | Yes | Default organization used by tools. |
| `TERRAFORM_ALLOWED_ORGANIZATIONS` | No | Comma-separated allowlist; defaults to the default organization. |
| `TERRAFORM_API_BASE_URL` | No | Defaults to `https://app.terraform.io/api/v2`. |
| `MCP_BEARER_TOKEN` | No | Optional incoming bearer token, minimum 16 characters. |
| `REQUEST_TIMEOUT_MS` | No | Terraform API timeout; defaults to 15000. |
| `PORT` | No | HTTP port; defaults to 3000. |

## Connect it to ChatGPT

1. Run the server locally.
2. Expose it securely over HTTPS using OpenAI Secure MCP Tunnel, or deploy it behind appropriate authentication.
3. In ChatGPT, enable Developer mode under **Settings → Security and login**.
4. Open **Settings → Plugins**, create a developer-mode app, and use the public `/mcp` URL.
5. Verify the six advertised tools and add the app to a new conversation.

Example prompts:

```text
List my Terraform workspaces and flag any that are locked or using an old Terraform version.
```

```text
Give me an operational overview of the job-board-infra workspace.
```

```text
Inspect the current run for job-board-infra and summarize the planned additions, changes, and destructions.
```

## Architecture

```text
ChatGPT / MCP client
        │ Streamable HTTP
        ▼
terraform-cloud-mcp
        │ JSON:API + Bearer token
        ▼
HCP Terraform API
```

The HTTP transport is stateless, which suits container platforms such as Cloud Run. A fresh MCP server and transport are created for each request.

## Roadmap

- OAuth 2.1 authentication for a safely hosted ChatGPT integration.
- Policy-check and cost-estimate summaries.
- Run event timelines.
- Optional write operations behind explicit feature flags and confirmation, beginning with queueing speculative plans only.
- Cross-provider diagnosis with Google Cloud and GitHub Actions.

## References

- [OpenAI Apps SDK: build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [OpenAI Apps SDK: connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [HCP Terraform API documentation](https://developer.hashicorp.com/terraform/cloud-docs/api-docs)
- [HCP Terraform Workspaces API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/workspaces)
- [HCP Terraform Runs API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/run)
- [HCP Terraform Plans API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/plans)

## License

MIT
