/**
 * 本地测试脚本
 * 
 * 用于测试 Vless 协议实现
 */

const crypto = require('crypto');

// 配置
const CONFIG = {
  uuid: '12345678-1234-1234-1234-123456789abc', // 替换为你的 UUID
  targetAddress: 'example.com',
  targetPort: 80
};

// ============================================
// 生成 Vless 请求
// ============================================
function buildVlessRequest(uuid, address, port, payload = Buffer.alloc(0)) {
  const parts = [];

  // 1. Version (0x00)
  parts.push(Buffer.from([0x00]));

  // 2. UUID (16 bytes)
  parts.push(parseUUID(uuid));

  // 3. Addons Length (0x00)
  parts.push(Buffer.from([0x00]));

  // 4. Command (0x01 = TCP)
  parts.push(Buffer.from([0x01]));

  // 5. Address
  if (isIPv4(address)) {
    // IPv4
    parts.push(Buffer.from([0x01]));
    parts.push(Buffer.from(address.split('.').map(Number)));
  } else {
    // Domain
    parts.push(Buffer.from([0x02]));
    const domainBuffer = Buffer.from(address, 'utf8');
    parts.push(Buffer.from([domainBuffer.length]));
    parts.push(domainBuffer);
  }

  // 6. Port (big-endian)
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(port, 0);
  parts.push(portBuffer);

  // 7. Payload
  if (payload.length > 0) {
    parts.push(payload);
  }

  return Buffer.concat(parts);
}

// ============================================
// 解析 Vless 响应
// ============================================
function parseVlessResponse(buffer) {
  if (buffer.length < 2) {
    return { valid: false, error: 'Response too short' };
  }

  const version = buffer[0];
  const addonsLen = buffer[1];
  const payload = buffer.slice(2 + addonsLen);

  return {
    valid: true,
    version,
    payload
  };
}

// ============================================
// 辅助函数
// ============================================
function parseUUID(uuidString) {
  const hex = uuidString.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

function isIPv4(address) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(address);
}

function formatHex(buffer) {
  return buffer.toString('hex').match(/.{1,2}/g).join(' ');
}

// ============================================
// 测试
// ============================================
console.log('=== Vless Protocol Test ===\n');

// 生成请求
const request = buildVlessRequest(
  CONFIG.uuid,
  CONFIG.targetAddress,
  CONFIG.targetPort,
  Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n')
);

console.log('Request:');
console.log('  UUID:', CONFIG.uuid);
console.log('  Target:', `${CONFIG.targetAddress}:${CONFIG.targetPort}`);
console.log('  Total length:', request.length, 'bytes');
console.log('  Hex:', formatHex(request.slice(0, Math.min(50, request.length))) + (request.length > 50 ? '...' : ''));

// 模拟响应
const response = Buffer.from([0x00, 0x00]);
const parsed = parseVlessResponse(response);

console.log('\nResponse:');
console.log('  Valid:', parsed.valid);
console.log('  Version:', parsed.version);

// 生成新的 UUID
console.log('\n=== Generate New UUID ===');
console.log('New UUID:', crypto.randomUUID());

console.log('\n=== Usage ===');
console.log('1. Deploy to Vercel: vercel --prod');
console.log('2. Update UUID in api/lib/config.js');
console.log('3. Configure client with the UUID and domain');
