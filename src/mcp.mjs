import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { createTevalis } from './tevalis.mjs';

export async function handleMcp(request, env, fetcher) {
  const api = createTevalis(env, fetcher);
  const server = new McpServer({ name: 'tevalis', version: '1.0.0' });
  const siteId = z.union([9424, 8808, 9524, 8809, 10947, 9884, 8066].map(id => z.literal(id)));
  const dates = { startDate: z.string().describe('ISO timestamp with explicit timezone, e.g. 2026-10-07T00:00:00+04:00'),
    endDate: z.string().describe('ISO timestamp with explicit timezone') };
  const register = (name, description, inputSchema, method) => server.registerTool(name, {
    description, inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async args => {
    try {
      const data = await method(args);
      const text = JSON.stringify(data);
      if (text.length > 150000) throw new Error('Result too large; reduce the date range or page size.');
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  });
  register('tevalis_list_sites', 'Read live venue names for one region, restricted to the seven approved venues.',
    { region: z.enum(['dubai', 'abu-dhabi']) }, api.sites);
  register('tevalis_sales_summary', 'Read sales header totals for an approved venue over at most 24 hours. Cached by Tevalis for 60 minutes.',
    { siteId, ...dates }, api.sales);
  register('tevalis_stock_levels', 'Read estimated inventory levels and quantities on order; locally paginated.',
    { siteId, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(25) }, api.stock);
  register('tevalis_z_reports', 'Read Z-report identifiers and timestamps for an approved venue over at most 14 days.',
    { siteId, ...dates }, api.zReports);
  const attendanceInput = { siteId, ...dates, userId: z.number().int().positive().optional(),
    offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(25) };
  register('tevalis_clock_records', 'Read recorded employee clock-in and clock-out events for up to 14 days. Optional employee ID filter. Does not clock staff in or out.',
    attendanceInput, api.attendance);
  register('tevalis_clock_edit_history', 'Read changes to clock-in/out records made in the Tevalis portal, filtered by change dates (up to 14 days). Does not modify attendance.',
    attendanceInput, api.attendanceEdits);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 16384,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    // Buffer this bounded JSON response before closing the stateless transport.
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status, headers: { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store' },
    });
  } finally { await server.close(); }
}
