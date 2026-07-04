/**
 * Vless Proxy 配置
 */

// ============================================
// ⚠️ 请修改此 UUID 为您自己的 UUID
// ============================================
// 生成命令: node -e "console.log(crypto.randomUUID())"
const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

// WebSocket 路径
const WS_PATH = '/api/vless';

// 日志开关
const DEBUG = true;

module.exports = {
  VALID_UUID,
  WS_PATH,
  DEBUG
};
