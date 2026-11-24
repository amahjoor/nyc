// Exercise the same WebSocket protocol and origin as a packaged game joining the lobby.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { PROTOCOL } from '../../dist/lobby-protocol.js';

const endpoint = new URL(process.argv[2]);
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
if (endpoint.protocol !== 'wss:' && !(loopback && endpoint.protocol === 'ws:')) {
  throw Error('Supply the public wss:// lobby URL or a loopback test address.');
}
const socket = new WebSocket(endpoint, PROTOCOL, {
  origin: 'concrete://game',
  handshakeTimeout: 8000
});
try {
  const welcome = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Timed out waiting for lobby welcome')), 10000);
    socket.once('message', data => { clearTimeout(timeout); resolve(data); });
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
    socket.once('close', () => { clearTimeout(timeout); reject(Error('Lobby closed before welcome')); });
  });
  const data = JSON.parse(welcome);
  assert.equal(socket.protocol, PROTOCOL);
  assert.equal(data.type, 'welcome');
  assert.ok(Number.isInteger(data.capacity) && data.capacity > 0);
  console.log('Connected to', endpoint.origin, 'as', data.name, 'with capacity', data.capacity);
} finally {
  socket.terminate();
}
