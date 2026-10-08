import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from '../src/app.mjs';
import { createTevalis, dateRange } from '../src/tevalis.mjs';

const env = { CHATGPT_ACTION_TOKEN: 'test-only-token-not-for-deployment-12345',
  TEVALIS_DUBAI_GUID: 'test-dubai', TEVALIS_ABU_DHABI_GUID: 'test-abudhabi', TEVALIS_DEV_ID: 'test-dev' };
const dates = { startDate: '2026-10-07T00:00:00+04:00', endDate: '2026-10-08T00:00:00+04:00' };

test('official MCP client initializes, discovers tools, and calls the scoped live adapter', async () => {
  const requests = [];
  const upstream = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json([{ SiteID: 9424, Name: 'KARAKI' }, { SiteID: 9999, Name: 'Outside scope' }]);
  };
  const client = new Client({ name: 'test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://worker.example/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${env.CHATGPT_ACTION_TOKEN}` } },
    fetch: (url, options) => worker.fetch(new Request(url, options), env, undefined, upstream),
  });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
    const result = await client.callTool({ name: 'tevalis_list_sites', arguments: { region: 'dubai' } });
    assert.ok(!result.isError);
    assert.deepEqual(JSON.parse(result.content[0].text).sites, [{ siteId: 9424, name: 'KARAKI', region: 'dubai' }]);
    assert.equal(requests[0].url, 'https://api.tevalis.com/Sites');
    assert.equal(requests[0].options.headers.CompanyId, '1549');
    assert.equal(requests[0].options.headers.GUID, 'test-dubai');
    assert.equal(requests[0].options.headers.GUID2, undefined);
    const denied = await client.callTool({ name: 'tevalis_stock_levels', arguments: { siteId: 9999 } });
    assert.equal(denied.isError, true);
    assert.equal(requests.length, 1);
  } finally { await client.close(); }
});

test('date ranges reject invalid calendar dates, missing zones, and excessive periods', () => {
  assert.deepEqual(dateRange(dates.startDate, dates.endDate, 1), { StartDate: dates.startDate, EndDate: dates.endDate });
  for (const [start, end] of [
    ['2026-02-30T00:00:00Z', '2026-03-03T00:00:00Z'],
    ['2026-10-07T00:00:00', dates.endDate],
    [dates.endDate, dates.startDate],
    [dates.startDate, '2026-10-09T00:00:00+04:00'],
  ]) assert.throws(() => dateRange(start, end, 1));
});

test('sales totals preserve supplied signs without returning employee details', async () => {
  const api = createTevalis(env, async (url, options) => {
    assert.equal(options.headers.CompanyId, '1580');
    assert.equal(options.headers.GUID, 'test-abudhabi');
    assert.equal(url.pathname, '/v2/Sales/GetSalesExport/8066');
    assert.equal(url.searchParams.get('StartDate'), dates.startDate);
    return Response.json({ SiteID: 8066, transactions: [10, -2].map(n => ({ ActualGrossAmt: n,
      ActualNetAmt: n, TaxAmt: 0, ServiceChargeAmt: 0, GratuityAmt: 0, TotalDiscountAmount: 0,
      IsRefund: n < 0, EmployeeOpenedBill: 'private' })) });
  });
  const data = await api.sales({ siteId: 8066, ...dates });
  assert.equal(data.totals.ActualGrossAmt, 8);
  assert.equal(data.transactionCount, 2);
  assert.equal(data.refundTransactionCount, 1);
  assert.ok(!JSON.stringify(data).includes('private'));
});

test('upstream failures never expose upstream response bodies', async () => {
  const api = createTevalis(env, async () => new Response('sensitive upstream details', { status: 401 }));
  await assert.rejects(api.sites({ region: 'dubai' }), { message: 'Tevalis returned HTTP 401.' });
});

test('stock pagination reports totals and next page', async () => {
  const api = createTevalis(env, async () => Response.json({ SiteID: 9424, Products: [{ id: 1 }, { id: 2 }] }));
  const data = await api.stock({ siteId: 9424, limit: 1 });
  assert.deepEqual(data.products, [{ id: 1 }]);
  assert.equal(data.nextOffset, 1);
  assert.equal(data.total, 2);
});

test('MCP endpoint rejects unauthenticated and foreign-origin requests', async () => {
  assert.equal((await worker.fetch(new Request('https://worker.example/mcp'), env)).status, 401);
  const request = new Request('https://worker.example/mcp', { headers: {
    Authorization: `Bearer ${env.CHATGPT_ACTION_TOKEN}`, Origin: 'https://untrusted.example',
  } });
  assert.equal((await worker.fetch(request, env)).status, 403);
});

test('clock records preserve event timestamps, filter users, and paginate', async () => {
  const api = createTevalis(env, async (url, options) => {
    assert.equal(url.pathname, '/Attendance/9424');
    assert.equal(url.searchParams.get('UserID'), '7');
    assert.equal(options.method, 'GET');
    return Response.json({ SiteID: 9424, UserAttendance: [
      { UserID: 7, Events: [{ Event: 'Clock In', EventTime: '2026-10-07T09:00:00' }] },
      { UserID: 8, Events: [] },
    ] });
  });
  const data = await api.attendance({ siteId: 9424, ...dates, userId: 7 });
  assert.equal(data.totalUsers, 1);
  assert.equal(data.users[0].Events[0].EventTime, '2026-10-07T09:00:00');
  assert.equal(data.nextOffset, null);
});

test('clock edit history uses changed-date parameters and remains read-only', async () => {
  const api = createTevalis(env, async (url, options) => {
    assert.equal(url.pathname, '/Attendance/GetAttendanceLogEdits/8066');
    assert.equal(url.searchParams.get('ChangedStartDate'), dates.startDate);
    assert.equal(url.searchParams.get('ChangedEndDate'), dates.endDate);
    assert.equal(url.searchParams.has('StartDate'), false);
    assert.equal(options.method, 'GET');
    return Response.json({ SiteID: 8066, AttendanceLogEdits: [] });
  });
  const data = await api.attendanceEdits({ siteId: 8066, ...dates });
  assert.equal(data.totalEdits, 0);
});
