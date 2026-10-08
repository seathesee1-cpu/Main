import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = ['build', '--build-arg', 'HTTPS_PROXY', '--build-arg', 'HTTP_PROXY', '--build-arg', 'NO_PROXY'];
if (process.env.DOCKER_BUILD_NETWORK) args.push('--network', process.env.DOCKER_BUILD_NETWORK);
if (process.env.DOCKER_BUILD_RESOLVE_PROXY === '1') {
  const hosts = new Set(['HTTPS_PROXY', 'HTTP_PROXY'].filter(k => process.env[k]).map(k => new URL(process.env[k]).hostname));
  for (const host of hosts) {
    const { address } = await lookup(host, { family: 4 });
    args.push('--add-host', `${host}:${address}`);
  }
}
const ca = process.env.NODE_EXTRA_CA_CERTS;
if (ca && existsSync(ca)) args.push('--secret', `id=build_ca,src=${ca}`);
args.push('-t', 'tevalis-mcp:local', '.');
const result = spawnSync('docker', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
if (result.error) console.error('Docker build could not start.');
process.exitCode = result.status ?? 1;
