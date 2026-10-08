import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomBytes } from 'node:crypto';
import worker from '../src/app.mjs';

const env = { ...process.env, CHATGPT_ACTION_TOKEN: randomBytes(32).toString('hex') };
const client = new Client({ name: 'tevalis-live-check', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL('https://local-validation.invalid/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${env.CHATGPT_ACTION_TOKEN}` } },
  fetch: (url, options) => worker.fetch(new Request(url, options), env),
});
await client.connect(transport);
try {
  const { tools } = await client.listTools();
  console.log(`MCP initialized: ${tools.length} tools`);
  for (const region of ['dubai', 'abu-dhabi']) {
    const result = await client.callTool({ name: 'tevalis_list_sites', arguments: { region } });
    if (result.isError) throw new Error(`${region}: ${result.content[0].text}`);
    const data = JSON.parse(result.content[0].text);
    console.log(JSON.stringify({ region, sites: data.sites, missingSiteIds: data.missingSiteIds }));
    if (data.missingSiteIds.length) process.exitCode = 1;
  }
  // Explicit timestamps make this check reproducible; only metadata is logged.
  if (process.env.TEVALIS_CHECK_START && process.env.TEVALIS_CHECK_END) {
    for (const siteId of [9424, 8066]) {
      for (const name of ['tevalis_sales_summary', 'tevalis_z_reports', 'tevalis_stock_levels', 'tevalis_clock_records', 'tevalis_clock_edit_history']) {
        const args = name === 'tevalis_stock_levels' ? { siteId, limit: 1 } : {
          siteId, startDate: process.env.TEVALIS_CHECK_START, endDate: process.env.TEVALIS_CHECK_END,
        };
        const result = await client.callTool({ name, arguments: args });
        if (result.isError) { console.log(JSON.stringify({ siteId, tool: name, error: result.content[0].text })); process.exitCode = 1; }
        else {
          const data = JSON.parse(result.content[0].text);
          console.log(JSON.stringify({ siteId, tool: name, passed: true,
            count: data.transactionCount ?? data.reports?.length ?? data.total ?? data.totalUsers ?? data.totalEdits }));
        }
      }
    }
  }
} finally { await client.close(); }
