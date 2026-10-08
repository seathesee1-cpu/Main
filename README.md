# Tevalis MCP server

A read-only MCP server targeting Render (or any Docker host), using the official MCP SDK
and stateless Streamable HTTP at `/mcp`. Calls use the documented Tevalis HTTPS
API with CompanyId, GUID and DevID headers. GUID2 is not used because there are
no write operations. Supplied credential values are not stored in this project.

## Tools

- `tevalis_list_sites`: live names restricted to the seven requested site IDs.
- `tevalis_sales_summary`: transaction-header amount totals, maximum 24 hours;
  no employee names or transaction details are returned. Tevalis caches this
  export for 60 minutes. Refund amounts keep their supplied signs.
- `tevalis_stock_levels`: estimated stock and quantities on order, paginated.
- `tevalis_z_reports`: report identifiers and times, maximum 14 days.
- `tevalis_clock_records`: employee clock-in/out events, optional employee filter,
  maximum 14 days, pagination by employee.
- `tevalis_clock_edit_history`: attendance-edit audit trail by changed-date range,
  optional employee filter, maximum 14 days, paginated.

All timestamps supplied to tools must have an explicit timezone; UAE is +04:00.
Clock event timestamps from Tevalis are preserved without inventing a timezone.
The documented API exposes attendance reads and edit-history reads, but no
endpoint to create a clock-in or clock-out event. This server cannot clock staff
in/out or modify attendance.

## Verified on 8 October 2026

- Both company credentials authenticated successfully against `/Sites`.
- Six venue IDs were returned by their expected companies. Dubai company 1549
  did not list WON JVC 9524; its separate Z-report request returned HTTP 200 with
  an empty list. This mapping remains unverified. Abu Dhabi company is 1580.
- Official SDK client: initialize, tools/list and tools/call passed.
- Actual local HTTP: initialize and discovery of all six tools passed.
- Docker image built successfully. The packaged server passed readiness, MCP
  initialization and discovery, and live site-list calls for both regions.
- 17 automated tests passed, including auth, scope enforcement, date validation,
  sales totals, pagination, and attendance queries. The standalone HTTP adapter also passes MCP client tests.
- Live MCP calls for 7 October 2026 (00:00 to next midnight, +04:00):
  KARAKI 9424 returned 78 sales transactions, one Z-report, 682 inventory products,
  attendance records for 11 employees, and no attendance edits.
  Yas Mall 8066 returned 418 inventory products; sales, Z-report, attendance and
  attendance-edit calls returned valid empty results. Empty results are not evidence
  of absent business activity or complete reporting permissions.
- The live-check script exits nonzero while any configured site is absent from
  the company site list. Its latest nonzero exit was caused by missing site 9524,
  not by authentication or failures of the representative report calls.

## Local and cloud configuration

Use Node.js >=22 (Node.js >=24 for the optional environment-proxy switch).
From `/workspace/Main`:

```sh
npm --cache /tmp/tevalis-npm-cache ci --no-audit --no-fund
npm test
DOCKER_CONFIG=/tmp/tevalis-docker DOCKER_BUILD_NETWORK=host DOCKER_BUILD_RESOLVE_PROXY=1 npm run build:image
```

`npm run build:image` builds a portable Docker image. The dependency versions are
pinned in package-lock.json. This cloud machine needs host-network proxy DNS
resolution during Docker builds; the build helper resolves the configured proxy
and mounts its CA certificate temporarily while retaining TLS verification.
Normal deployment hosts can run `docker build .` without those local overrides.
Secrets required by the running server:

- CHATGPT_ACTION_TOKEN: independent random bearer secret, at least 32 characters.
- TEVALIS_DUBAI_GUID: Dubai API GUID.
- TEVALIS_ABU_DHABI_GUID: Abu Dhabi API GUID.
- TEVALIS_DEV_ID: shared developer ID.

For local use, inject these through the process environment, then run `npm start`.
It binds to loopback port 8787. Do not print tokens or commit credential files.
Use Node's `NODE_USE_ENV_PROXY=1` when live requests must use the environment proxy.
To repeat live checks with injected credentials, run `node scripts/live-check.mjs`.
Optionally set TEVALIS_CHECK_START and TEVALIS_CHECK_END to explicit timestamps
spanning at most one day to exercise report and attendance tools too.

Authenticated requests to `/health` report configuration presence, not live
connectivity. `/sites` is the original static directory; use the MCP live-sites
tool for verified API data. `scripts/openapi.mjs` still describes only that static
directory and is not a schema for the MCP tools.

## Deployment and ChatGPT status

The selected host is **Render**, using the Docker service in `render.yaml`.
Cloudflare tooling and configuration have been removed. The MCP server is
**not deployed or installed in ChatGPT**. No Render token or other usable cloud
credentials are available in this session. The Blueprint declares a free service;
free hosting may sleep when idle, so a continuously available production service
would require an appropriate paid plan. No paid resources have been provisioned.

The Docker image uses Node.js 24, runs as the non-root `node` user, and listens on
0.0.0.0:10000. Render supplies the external HTTPS URL through RENDER_EXTERNAL_URL.
Other hosts can use PUBLIC_BASE_URL. The public `/ready` route returns only a
boolean and HTTP 503 when Tevalis credentials are missing; it does not establish
live upstream connectivity. Business endpoints require bearer authentication.
`render.yaml` generates the independent service token and declares the three API
secrets without storing values. Environment settings drafts do not supply Render
with those values and do not deploy the service.

Current MCP authentication is a bearer token, verified with the official SDK.
ChatGPT authentication compatibility has not been tested. If the ChatGPT custom
connector flow requires OAuth instead of a configurable bearer header, a compatible
OAuth authorization layer must be configured before registration. No available
tool can register this custom connector in ChatGPT. A deployed URL alone is not
sufficient evidence of a functioning ChatGPT installation.

For an authorized deployment, publish the repository/image to Render, bind the
three Tevalis secrets, then validate authenticated MCP calls at the actual HTTPS
URL. Do not expose business or employee data through an unauthenticated endpoint.
Do not put credential values in source, URLs, or logs.

Use the existing checkout; do not create a Git worktree unless explicitly requested.

## Sources

- https://api.tevalis.com/Help/Index
- https://api.tevalis.com/Content/Tevalis%20API%20Documentation.pdf
- https://api.tevalis.com/Help/Api/GET-Attendance-SiteID_StartDate_EndDate_UserID
- https://api.tevalis.com/Help/Api/GET-Attendance-GetAttendanceLogEdits-SiteID_UserID_ChangedStartDate_ChangedEndDate
