/**
 * Vless Proxy Server - Vercel Functions
 * 纯 ES Module 版本，兼容 Edge Runtime
 */

// 配置
const VALID_UUID = 'e75183c2-0733-4cb0-9c69-0ac79ef6b910';
const WS_PATH = '/api/vless';
const DEBUG = true;

// Edge Runtime 配置
export const config = {
  runtime: 'edge',
};

// 主处理函数
export default async function handler(request) {
  const url = new URL(request.url);
  
  // 健康检查
  if (url.pathname === '/' || url.pathname === '/api') {
    return jsonResponse({
      status: 'ok',
      server: 'Vless Proxy',
      version: '1.0.0',
      protocol: 'vless',
      transport: 'websocket',
      path: WS_PATH
    });
  }

  // WebSocket 路径检查
  if (url.pathname !== WS_PATH && url.pathname !== '/api/vless') {
    return jsonResponse({ error: 'Not Found' }, 404);
  }

  // WebSocket 升级检查
  const upgrade = request.headers.get('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    return jsonResponse({
      status: 'ready',
      message: 'WebSocket endpoint',
      connect: `wss://${url.host}${WS_PATH}`
    });
  }

  // 处理 WebSocket 连接
  return handleVlessWebSocket(request);
}

// WebSocket 处理
async function handleVlessWebSocket(request) {
  debugLog('=== New WebSocket Connection ===');

  const pair = new WebSocketPair();
  const [server, client] = [pair[0], pair[1]];
  
  server.accept();

  const session = {
    connected: false,
    target: null,
    stats: { up: 0, down: 0 }
  };

  server.addEventListener('message', async (event) => {
    try {
      const buffer = await toBuffer(event.data);
      debugLog(`← Received ${buffer.length} bytes`);

      if (!session.connected) {
        const handshake = parseVlessHandshake(buffer);
        
        if (!handshake.valid) {
          debugLog('✗ Handshake failed:', handshake.error);
          server.close(1002, handshake.error);
          return;
        }

        session.target = {
          address: handshake.address,
          port: handshake.port,
          command: handshake.command
        };
        session.connected = true;

        debugLog(`✓ Connected: ${handshake.address}:${handshake.port}`);

        sendVlessResponse(server, true);

        if (handshake.payload?.length > 0) {
          debugLog(`→ Initial payload: ${handshake.payload.length} bytes`);
          handleData(server, handshake.payload, session);
        }
      } else {
        handleData(server, buffer, session);
      }
    } catch (error) {
      debugLog('Error:', error.message);
      server.close(1011, 'Internal error');
    }
  });

  server.addEventListener('close', () => {
    debugLog(`=== Connection Closed ===`);
    debugLog(`Stats: ↑${session.stats.up} bytes, ↓${session.stats.down} bytes`);
  });

  server.addEventListener('error', () => {
    debugLog('WebSocket error');
  });

  return new Response(null, { status: 101, webSocket: client });
}

// Vless 协议解析
function parseVlessHandshake(buffer) {
  const result = { valid: false, error: null };
  
  try {
    let offset = 0;

    if (buffer[offset++] !== 0x00) {
      result.error = 'Invalid version';
      return result;
    }

    const uuid = formatUUID(buffer.slice(offset, offset + 16));
    offset += 16;

    if (uuid !== VALID_UUID) {
      result.error = 'Invalid UUID';
      return result;
    }
    result.uuid = uuid;

    const addonsLen = buffer[offset++];
    offset += addonsLen;

    const command = buffer[offset++];
    result.command = command;
    result.commandName = { 0x01: 'TCP', 0x02: 'UDP', 0x03: 'Mux' }[command] || 'Unknown';

    if (command !== 0x01 && command !== 0x02) {
      result.error = `Unsupported command: ${command}`;
      return result;
    }

    const addrType = buffer[offset++];
    let address;

    switch (addrType) {
      case 0x01:
        address = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`;
        offset += 4;
        break;
      case 0x02:
        const domainLen = buffer[offset++];
        address = decodeUTF8(buffer.slice(offset, offset + domainLen));
        offset += domainLen;
        break;
      case 0x03:
        address = formatIPv6(buffer.slice(offset, offset + 16));
        offset += 16;
        break;
      default:
        result.error = `Unknown address type: ${addrType}`;
        return result;
    }
    result.address = address;

    const port = (buffer[offset] << 8) | buffer[offset + 1];
    offset += 2;
    result.port = port;

    result.payload = buffer.slice(offset);
    result.valid = true;
    return result;

  } catch (error) {
    result.error = error.message;
    return result;
  }
}

function sendVlessResponse(ws, success) {
  const response = new Uint8Array([0x00, 0x00]);
  ws.send(response);
}

function handleData(ws, data, session) {
  session.stats.up += data.length;
  debugLog(`→ Data: ${data.length} bytes to ${session.target?.address}:${session.target?.port}`);
  ws.send(data);
  session.stats.down += data.length;
}

// 辅助函数
async function toBuffer(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data.arrayBuffer) return new Uint8Array(await data.arrayBuffer());
  return new Uint8Array(data);
}

function formatUUID(bytes) {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function formatIPv6(bytes) {
  const parts = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(`${bytes[i].toString(16).padStart(2, '0')}${bytes[i+1].toString(16).padStart(2, '0')}`);
  }
  return parts.join(':');
}

function decodeUTF8(bytes) {
  return new TextDecoder().decode(bytes);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function debugLog(...args) {
  if (DEBUG) {
    const time = new Date().toISOString().split('T')[1].slice(0, 8);
    console.log(`[${time}]`, ...args);
  }
}
