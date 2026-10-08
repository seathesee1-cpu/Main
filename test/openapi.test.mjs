import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchema } from '../src/openapi.mjs';
import worker from '../src/app.mjs';

test('Actions schema describes the implemented authenticated directory', async () => {
  const schema = createSchema('https://integration.example');
  assert.deepEqual(schema.servers, [{ url: 'https://integration.example' }]);
  assert.deepEqual(schema.security, [{ bearerAuth: [] }]);
  assert.deepEqual(Object.keys(schema.paths), ['/sites']);
  const token = 'test-only-token-not-for-deployment-12345';
  const response = await worker.fetch(new Request('https://integration.example/sites', {
    headers: { Authorization: `Bearer ${token}` },
  }), { CHATGPT_ACTION_TOKEN: token });
  const body = await response.json();
  const model = schema.paths['/sites'].get.responses['200'].content['application/json'].schema;
  for (const key of model.required) assert.ok(Object.hasOwn(body, key));
  assert.ok(model.properties.source.enum.includes(body.source));
  assert.ok(model.properties.verifiedWithTevalis.enum.includes(body.verifiedWithTevalis));
  for (const site of body.sites) {
    for (const key of model.properties.sites.items.required) assert.ok(Object.hasOwn(site, key));
  }
});

test('schema generation rejects insecure URLs and embedded credentials', () => {
  for (const url of ['http://example.com', 'https://user:password@example.com',
    'https://example.com/path', 'https://example.com?token=secret', 'https://example.com#fragment']) {
    assert.throws(() => createSchema(url));
  }
});
