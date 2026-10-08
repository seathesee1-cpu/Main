import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/app.mjs';

const token = 'test-only-token-not-for-deployment-12345';
const env = { CHATGPT_ACTION_TOKEN: token };
const call = (path, options = {}, bindings = env) => worker.fetch(
  new Request(`https://integration.example${path}`, {
    headers: { Authorization: `Bearer ${token}` }, ...options,
  }), bindings);

test('fails closed with missing or weak service credentials', async () => {
  for (const bindings of [{}, { CHATGPT_ACTION_TOKEN: 'short' }]) {
    assert.equal((await call('/sites', {}, bindings)).status, 503);
  }
});
test('rejects absent and incorrect bearer tokens', async () => {
  for (const headers of [{}, { Authorization: 'Bearer incorrect' }]) {
    assert.equal((await call('/sites', { headers })).status, 401);
  }
});
test('lists exactly the seven configured venues with provenance', async () => {
  const response = await call('/sites');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.equal(body.verifiedWithTevalis, false);
  assert.equal(body.source, 'user_configuration');
  assert.deepEqual(body.sites.map(s => s.siteId), [9424, 8808, 9524, 8809, 10947, 9884, 8066]);
});
test('regional filters prevent mixing company mappings', async () => {
  for (const [region, companyId, count] of [['dubai', 1549, 4], ['abu-dhabi', 1580, 3]]) {
    const body = await (await call(`/sites?region=${region}`)).json();
    assert.equal(body.sites.length, count);
    assert.ok(body.sites.every(s => s.companyId === companyId));
  }
  assert.equal((await call('/sites?region=unknown')).status, 400);
});
test('unsupported operations fail and health does not claim live connectivity', async () => {
  assert.equal((await call('/sales')).status, 404);
  assert.equal((await call('/sites', { method: 'POST' })).status, 405);
  const body = await (await call('/health')).json();
  assert.equal(body.tevalisApi, 'not_checked');
  assert.equal(body.credentialsConfigured, false);
});
