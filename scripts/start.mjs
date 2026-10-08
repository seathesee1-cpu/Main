import { createHttpServer } from '../src/http.mjs';

const server = createHttpServer(process.env);
server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => {
  console.log('Tevalis MCP HTTP server started');
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
