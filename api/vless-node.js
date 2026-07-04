/**
 * Vless Proxy Server - Node.js Runtime 版本
 * 
 * 适用于 Vercel Functions (Node.js Runtime)
 * 提供完整的 WebSocket 支持
 */

const { parseVlessRequest, buildVlessResponse } = require('./lib/vless-parser');
const { handleTcpProxy, handleUdpProxy } = require('./lib/proxy');
const { VALID_UUID, WS_PATH, DEBUG } = require('./lib/config');

// 导出配置
module.exports.config = {
  runtime: 'nodejs20.x',
  maxDuration: 60
};

/**
 * 主处理函数
 */
module.exports.default = async function handler(req, res) {
  // 检查 WebSocket 升级
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    return handleWebSocketUpgrade(req, res);
  }

  // HTTP 请求 - 返回服务信息
  res.status(200).json({
    status: 'ok',
    server: 'Vless Proxy',
    version: '1.0.0',
    protocol: 'vless',
    transport: 'websocket',
    tls: true,
    usage: {
      websocket: 'ws(s)://your-domain/api/vless',
      path: WS_PATH
    }
  });
};

/**
 * 处理 WebSocket 升级
 */
async function handleWebSocketUpgrade(req, res) {
  debugLog('WebSocket upgrade requested');

  // Vercel Node.js Runtime 的 WebSocket 处理
  // 需要使用自定义的 WebSocket 服务器
  
  // 注意：Vercel Functions 的 WebSocket 支持有限
  // 建议使用 Edge Runtime 或 Vercel 的实时功能

  // 发送升级响应
  const acceptKey = req.headers['sec-websocket-key'];
  const hash = require('crypto')
    .createHash('sha1')
    .update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  res.socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${hash}\r\n\r\n`
  );

  // 处理 WebSocket 连接
  handleWebSocketConnection(res.socket);
}

/**
 * 处理 WebSocket 连接
 */
function handleWebSocketConnection(socket) {
  debugLog('WebSocket connection established');

  let isConnected = false;
  let state = {
    targetAddress: null,
    targetPort: null,
    command: null
  };

  // WebSocket 帧处理
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    // 尝试解析 WebSocket 帧
    while (buffer.length >= 2) {
      const frame = parseWebSocketFrame(buffer);
      if (!frame) break;
      
      buffer = buffer.slice(frame.totalLength);
      
      if (frame.opcode === 0x08) {
        // Close frame
        socket.end();
        return;
      }
      
      if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        // Text or Binary frame
        handleWebSocketMessage(socket, frame.payload, state, (connected) => {
          isConnected = connected;
        });
      }
    }
  });

  socket.on('error', (error) => {
    debugLog('Socket error:', error.message);
  });

  socket.on('close', () => {
    debugLog('Socket closed');
  });
}

/**
 * 处理 WebSocket 消息
 */
function handleWebSocketMessage(socket, payload, state, setConnected) {
  debugLog(`Message received: ${payload.length} bytes`);

  if (!state.targetAddress) {
    // 首次消息，解析 Vless 请求
    const parsed = parseVlessRequestNative(payload);
    
    if (!parsed) {
      debugLog('Invalid Vless request');
      sendWebSocketFrame(socket, 0x02, Buffer.from([0x00]));
      socket.end();
      return;
    }

    state.targetAddress = parsed.address;
    state.targetPort = parsed.port;
    state.command = parsed.command;

    debugLog('Connected to:', `${parsed.address}:${parsed.port}`);

    // 发送成功响应
    const response = Buffer.from([0x00, 0x00]);
    sendWebSocketFrame(socket, 0x02, response);
    
    setConnected(true);

    // 处理初始 payload
    if (parsed.payload && parsed.payload.length > 0) {
      handleProxyData(socket, parsed.payload, state);
    }
  } else {
    // 转发数据
    handleProxyData(socket, payload, state);
  }
}

/**
 * 原生解析 Vless 请求
 */
function parseVlessRequestNative(buffer) {
  try {
    let offset = 0;

    // Version
    const version = buffer[offset++];
    if (version !== 0x00) return null;

    // UUID
    const uuidBytes = buffer.slice(offset, offset + 16);
    const uuid = formatUUID(uuidBytes);
    offset += 16;

    if (uuid !== VALID_UUID) return null;

    // Addons
    const addonsLen = buffer[offset++];
    offset += addonsLen;

    // Command
    const command = buffer[offset++];

    // Address
    const addrType = buffer[offset++];
    let address;

    switch (addrType) {
      case 0x01:
        address = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`;
        offset += 4;
        break;
      case 0x02:
        const domainLen = buffer[offset++];
        address = buffer.slice(offset, offset + domainLen).toString('utf8');
        offset += domainLen;
        break;
      case 0x03:
        offset += 16;
        address = 'ipv6';
        break;
      default:
        return null;
    }

    // Port
    const port = buffer.readUInt16BE(offset);
    offset += 2;

    // Payload
    const payload = buffer.slice(offset);

    return { version, uuid, command, address, port, payload };
  } catch (error) {
    return null;
  }
}

/**
 * 处理代理数据
 */
function handleProxyData(socket, data, state) {
  debugLog(`Proxy: ${data.length} bytes -> ${state.targetAddress}:${state.targetPort}`);
  
  // 简单回环（测试用）
  sendWebSocketFrame(socket, 0x02, data);
}

/**
 * 解析 WebSocket 帧
 */
function parseWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7f;

  let offset = 2;

  // Extended payload length
  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  // Masking key
  let maskKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  // Payload
  if (buffer.length < offset + payloadLen) return null;
  let payload = buffer.slice(offset, offset + payloadLen);

  // Unmask
  if (masked && maskKey) {
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return {
    fin,
    opcode,
    payload,
    totalLength: offset + payloadLen
  };
}

/**
 * 发送 WebSocket 帧
 */
function sendWebSocketFrame(socket, opcode, payload) {
  const payloadLen = payload.length;
  let frame;

  if (payloadLen <= 125) {
    frame = Buffer.alloc(2 + payloadLen);
    frame[0] = 0x80 | opcode; // FIN + opcode
    frame[1] = payloadLen;
    payload.copy(frame, 2);
  } else if (payloadLen <= 65535) {
    frame = Buffer.alloc(4 + payloadLen);
    frame[0] = 0x80 | opcode;
    frame[1] = 126;
    frame.writeUInt16BE(payloadLen, 2);
    payload.copy(frame, 4);
  } else {
    frame = Buffer.alloc(10 + payloadLen);
    frame[0] = 0x80 | opcode;
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payloadLen), 2);
    payload.copy(frame, 10);
  }

  socket.write(frame);
}

/**
 * 格式化 UUID
 */
function formatUUID(bytes) {
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/**
 * 调试日志
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Vless]', ...args);
  }
}
