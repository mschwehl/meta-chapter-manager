/**
 * SSE (Server-Sent Events) connection manager.
 *
 * - Maintains a set of connected response objects.
 * - broadcast(event, data) sends to all connected clients.
 * - Called from gitdb writeJson/deleteJson to notify frontends.
 */
const logger = require('./logger');

const _clients = new Set();

/** Register a new SSE client (Express response object). */
function addClient(res) {
  _clients.add(res);
  res.on('close', () => _clients.delete(res));
  logger.debug('sse.connect', { clients: _clients.size });
}

/** Broadcast an event to all connected clients. */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of _clients) {
    try { res.write(payload); } catch { _clients.delete(res); }
  }
}

function clientCount() { return _clients.size; }

module.exports = { addClient, broadcast, clientCount };
