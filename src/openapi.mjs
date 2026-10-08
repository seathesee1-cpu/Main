export function createSchema(serverUrl) {
  const url = new URL(serverUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Supply the deployed HTTPS origin without credentials, path, query or fragment');
  }
  const error = { description: 'Request failed', content: { 'application/json': {
    schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
  } } };
  return {
    openapi: '3.1.0',
    info: { title: 'Configured Tevalis venues', version: '0.1.0',
      description: 'User-configured venue directory only. No live Tevalis sales or account verification is available.' },
    servers: [{ url: url.origin }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    paths: { '/sites': { get: {
      operationId: 'listConfiguredVenues',
      summary: 'List configured venues, optionally by region',
      description: 'Returns user-provided mappings, not live Tevalis data. Never treat this result as evidence of API connectivity.',
      'x-openai-isConsequential': false,
      parameters: [{ name: 'region', in: 'query', required: false,
        schema: { type: 'string', enum: ['dubai', 'abu-dhabi'] } }],
      responses: {
        '200': { description: 'Configured venue mappings', content: { 'application/json': {
          schema: { type: 'object', required: ['source', 'verifiedWithTevalis', 'sites'], properties: {
            source: { type: 'string', enum: ['user_configuration'] },
            verifiedWithTevalis: { type: 'boolean', enum: [false] },
            sites: { type: 'array', items: { type: 'object', required: ['region', 'companyId', 'name', 'siteId'], properties: {
              region: { type: 'string', enum: ['dubai', 'abu-dhabi'] },
              companyId: { type: 'integer' }, name: { type: 'string' }, siteId: { type: 'integer' },
            } } },
          } },
        } } },
        '400': error, '401': error, '503': error,
      },
    } } },
  };
}
