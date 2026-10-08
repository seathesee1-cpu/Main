import { handleMcp } from './mcp.mjs';
// User-provided configuration, not a live response from Tevalis.
export const venues = Object.freeze([
  { region: 'dubai', companyId: 1549, name: 'KARAKI', siteId: 9424 },
  { region: 'dubai', companyId: 1549, name: 'MANDYS', siteId: 8808 },
  { region: 'dubai', companyId: 1549, name: 'WON JVC', siteId: 9524 },
  { region: 'dubai', companyId: 1549, name: 'WON DT', siteId: 8809 },
  { region: 'abu-dhabi', companyId: 1580, name: 'RENA', siteId: 10947 },
  { region: 'abu-dhabi', companyId: 1580, name: 'WOO', siteId: 9884 },
  { region: 'abu-dhabi', companyId: 1580, name: 'WON YAS MALL', siteId: 8066 },
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function equalSecret(a, b) {
  const encode = new TextEncoder();
  const digest = value => crypto.subtle.digest('SHA-256', encode.encode(value));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

export default {
  async fetch(request, env, context, fetcher) {
    if (!env.CHATGPT_ACTION_TOKEN || env.CHATGPT_ACTION_TOKEN.length < 32) {
      return json({ error: 'Service authentication is not configured' }, 503);
    }
    const supplied = request.headers.get('Authorization') || '';
    if (!(await equalSecret(supplied, `Bearer ${env.CHATGPT_ACTION_TOKEN}`))) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
    if (url.pathname === '/mcp') return handleMcp(request, env, fetcher);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/health') {
      return json({ status: 'running', venueDirectory: 'configured', mcp: '/mcp',
        tevalisApi: 'not_checked', credentialsConfigured: Boolean(env.TEVALIS_DUBAI_GUID && env.TEVALIS_ABU_DHABI_GUID && env.TEVALIS_DEV_ID) });
    }
    if (url.pathname === '/sites') {
      const region = url.searchParams.get('region');
      if (region !== null && !['dubai', 'abu-dhabi'].includes(region)) {
        return json({ error: 'region must be dubai or abu-dhabi' }, 400);
      }
      return json({ source: 'user_configuration', verifiedWithTevalis: false,
        sites: venues.filter(site => region === null || site.region === region) });
    }
    return json({ error: 'Not found' }, 404);
  },
};
