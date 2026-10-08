import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../src/http.mjs';

const env = { CHATGPT_ACTION_TOKEN: 'test-only-token-not-for-deployment-12345',
  TEVALIS_DUBAI_GUID: 'test-dubai', TEVALIS_ABU_DHABI_GUID: 'test-abu', TEVALIS_DEV_ID: 'test-dev' };

test('portable HTTP server supports readiness, authenticated MCP, and live adapter routing', async () => {
  const server = createHttpServer(env, async () => Response.json([{ SiteID: 9424, Name: 'KARAKI' }]));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  try {
    assert.deepEqual(await (await fetch(`${base}/ready`)).json(), { ready: true });
    assert.equal((await fetch(`${base}/sites`)).status, 401);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${env.CHATGPT_ACTION_TOKEN}` } },
    }));
    assert.equal((await client.listTools()).tools.length, 6);
    const result = await client.callTool({ name: 'tevalis_list_sites', arguments: { region: 'dubai' } });
    assert.ok(!result.isError);
    assert.equal(JSON.parse(result.content[0].text).sites[0].siteId, 9424);
  } finally {
    await client.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('readiness fails when API credentials are absent', async () => {
  const server = createHttpServer({ CHATGPT_ACTION_TOKEN: env.CHATGPT_ACTION_TOKEN });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ready: false });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
