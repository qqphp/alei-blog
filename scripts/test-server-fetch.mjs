import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { serverFetch } from '../lib/server-fetch.ts';

const previous = { ...process.env };
const sockets = new Set();
const origin = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  response.end(Buffer.concat(chunks).length ? Buffer.concat(chunks) : 'direct');
});
let tunnels = 0;
const proxy = createServer();
proxy.on('connect', (request, client, head) => {
  tunnels++;
  const [host, port] = request.url.split(':');
  const target = connect(Number(port), host, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) target.write(head);
    client.pipe(target);
    target.pipe(client);
  });
  sockets.add(client);
  sockets.add(target);
  client.on('error', () => target.destroy());
  target.on('error', () => client.destroy());
});
const listen = (server) =>
  new Promise((done) => server.listen(0, '127.0.0.1', done));
try {
  await listen(origin);
  await listen(proxy);
  for (const key of ['http_proxy', 'https_proxy', 'no_proxy'])
    delete process.env[key];
  process.env.HTTP_PROXY =
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.address().port}`;
  process.env.NO_PROXY = '';
  const url = `http://127.0.0.1:${origin.address().port}/`;
  assert.equal(
    await (
      await serverFetch(url, { method: 'POST', body: 'through proxy' })
    ).text(),
    'through proxy',
  );
  assert.equal(tunnels, 1);
  process.env.NO_PROXY = '127.0.0.1';
  assert.equal(await (await serverFetch(url)).text(), 'direct');
  assert.equal(tunnels, 1, 'NO_PROXY bypasses the tunnel');
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  assert.equal(await (await serverFetch(url)).text(), 'direct');
  console.log(
    'PASS Node HTTP proxy tunnel, request body, NO_PROXY and direct fallback',
  );
} finally {
  for (const socket of sockets) socket.destroy();
  origin.closeAllConnections();
  proxy.closeAllConnections();
  await Promise.all(
    [origin, proxy].map((server) => new Promise((done) => server.close(done))),
  );
  for (const key of Object.keys(process.env))
    if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
}
