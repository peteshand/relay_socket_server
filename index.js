const WebSocket = require('ws');

// Map from groupKey (string) to Set of WebSocket clients
const groups = new Map();

// Create WebSocket server on port 2050
const wss = new WebSocket.Server({ port: 2050 }, () => {
  console.log('Relay server listening on ws://0.0.0.0:2050');
});

wss.on('connection', (ws, req) => {
  // Extract group key from URL path, default to "default"
  let clientKey = req.url.replace(/^\/+/, '') || 'default';
  console.log(`Client connected from ${req.socket.remoteAddress}, group: ${clientKey}`);

  // Add client to its group
  if (!groups.has(clientKey)) {
    groups.set(clientKey, new Set());
  }
  groups.get(clientKey).add(ws);

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      console.warn('Invalid JSON:', raw.toString());
      return;
    }
    console.log(`Message in group ${clientKey}:`, msg);

    // Forward to all other clients in the same group
    const set = groups.get(clientKey);
    if (set) {
      for (const client of set) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected from group: ${clientKey}`);
    if (groups.has(clientKey)) {
      const set = groups.get(clientKey);
      set.delete(ws);
  
      // 🔔 Notify others in the same group
      const leaveMsg = JSON.stringify({ cmd: 'peer_left_session' });
      for (const client of set) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(leaveMsg);
        }
      }
  
      if (set.size === 0) {
        groups.delete(clientKey);
      }
    }
  });

  ws.on('error', err => {
    console.error('WebSocket error:', err);
  });
});

// ✅ Broadcast a ping every second to all connected clients
setInterval(() => {
  const pingMsg = JSON.stringify({ cmd: 'ping', timestamp: Date.now() });
  for (const [key, set] of groups.entries()) {
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(pingMsg);
      }
    }
  }
}, 1000);
