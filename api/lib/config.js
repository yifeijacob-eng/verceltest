/**
 * Vless Proxy 配置
 */

// ============================================
// ⚠️ 请修改此 UUID 为您自己的 UUID
// ============================================
// 生成命令: node -e "console.log(crypto.randomUUID())"
const VALID_UUID = 'e75183c2-0733-4cb0-9c69-0ac79ef6b910';

// WebSocket 路径
const WS_PATH = '/api/vless';

// 日志开关
const DEBUG = true;

module.exports = {
  VALID_UUID,
  WS_PATH,
  DEBUG
};
