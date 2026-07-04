/**
 * Vless 协议解析器
 * 
 * Vless 请求格式:
 * +--------+----------------+------------+--------+---------+---------+
 * | 1 byte |    16 bytes    |  L + V     | 1 byte |  L + V  |  ...    |
 * +--------+----------------+------------+--------+---------+---------+
 * | Version|      UUID      |  Addons    | Command| Address | Payload |
 * +--------+----------------+------------+--------+---------+---------+
 */

const { VALID_UUID, DEBUG } = require('./config');

/**
 * 解析 Vless 请求头
 */
function parseVlessRequest(buffer) {
  try {
    let offset = 0;

    // 1. Version (1 byte)
    const version = buffer[offset++];
    if (version !== 0x00) {
      debugLog('Invalid version:', version);
      return null;
    }

    // 2. UUID (16 bytes)
    const uuidBuffer = buffer.slice(offset, offset + 16);
    const uuid = formatUUID(uuidBuffer);
    offset += 16;

    // 3. 验证 UUID
    if (!validateUUID(uuid)) {
      debugLog('Invalid UUID:', uuid);
      return null;
    }

    // 4. Addons (Length + Value)
    const addonsLength = buffer[offset++];
    let addons = {};
    if (addonsLength > 0) {
      addons = parseAddons(buffer.slice(offset, offset + addonsLength));
      offset += addonsLength;
    }

    // 5. Command (1 byte)
    // 0x01 = TCP, 0x02 = UDP, 0x03 = Mux
    const command = buffer[offset++];

    // 6. Destination Address
    const addressResult = parseAddress(buffer, offset);
    if (!addressResult) {
      debugLog('Failed to parse address');
      return null;
    }
    offset = addressResult.newOffset;

    // 7. Payload (剩余数据)
    const payload = buffer.slice(offset);

    debugLog('Parsed request:', {
      version,
      uuid,
      command: command === 0x01 ? 'TCP' : command === 0x02 ? 'UDP' : 'Mux',
      destination: `${addressResult.address}:${addressResult.port}`,
      payloadLength: payload.length
    });

    return {
      version,
      uuid,
      addons,
      command,
      address: addressResult.address,
      port: addressResult.port,
      payload
    };
  } catch (error) {
    debugLog('Parse error:', error.message);
    return null;
  }
}

/**
 * 解析 Addons (扩展字段)
 */
function parseAddons(buffer) {
  const addons = {};
  let offset = 0;

  while (offset < buffer.length) {
    const keyLength = buffer[offset++];
    if (offset + keyLength > buffer.length) break;
    
    const key = buffer.slice(offset, offset + keyLength).toString();
    offset += keyLength;

    const valueLength = buffer[offset++];
    if (offset + valueLength > buffer.length) break;
    
    const value = buffer.slice(offset, offset + valueLength);
    offset += valueLength;

    addons[key] = value.toString();
  }

  return addons;
}

/**
 * 解析目标地址
 */
function parseAddress(buffer, offset) {
  const type = buffer[offset++];

  let address;
  let newOffset;

  switch (type) {
    case 0x01: // IPv4 (4 bytes)
      address = [
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3]
      ].join('.');
      newOffset = offset + 4;
      break;

    case 0x02: // Domain Name
      const domainLength = buffer[offset++];
      address = buffer.slice(offset, offset + domainLength).toString('utf8');
      newOffset = offset + domainLength;
      break;

    case 0x03: // IPv6 (16 bytes)
      const ipv6Parts = [];
      for (let i = 0; i < 16; i += 2) {
        ipv6Parts.push(
          buffer.slice(offset + i, offset + i + 2).toString('hex')
        );
      }
      address = ipv6Parts.join(':');
      newOffset = offset + 16;
      break;

    default:
      debugLog('Unknown address type:', type);
      return null;
  }

  // Port (2 bytes, big-endian)
  const port = buffer.readUInt16BE(newOffset);
  newOffset += 2;

  return { address, port, newOffset };
}

/**
 * 构建 Vless 响应头
 */
function buildVlessResponse() {
  // Version (0x00) + Addons Length (0x00)
  return Buffer.from([0x00, 0x00]);
}

/**
 * 验证 UUID
 */
function validateUUID(uuid) {
  return uuid === VALID_UUID;
}

/**
 * 格式化 UUID (从 Buffer)
 */
function formatUUID(buffer) {
  const hex = buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 解析 UUID (从字符串到 Buffer)
 */
function parseUUID(uuidString) {
  const hex = uuidString.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

/**
 * 调试日志
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[VlessParser]', ...args);
  }
}

module.exports = {
  parseVlessRequest,
  buildVlessResponse,
  validateUUID,
  formatUUID,
  parseUUID
};
