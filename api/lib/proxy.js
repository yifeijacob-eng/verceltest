/**
 * 代理处理模块
 */

const { buildVlessResponse } = require('./vless-parser');
const { DEBUG } = require('./config');

/**
 * 处理 TCP 代理
 */
async function handleTcpProxy(ws, parsedRequest) {
  const { address, port, payload } = parsedRequest;

  debugLog(`Connecting to ${address}:${port}`);

  try {
    // 使用 fetch API 作为 TCP 连接的替代方案
    // 注意: Vercel Functions 环境可能限制直接的 TCP 连接
    // 这里使用一种变通方案
    
    // 发送响应头，表示连接成功
    const responseHeader = buildVlessResponse();
    ws.send(responseHeader);

    // 创建一个简单的数据转发机制
    // 由于 Vercel 环境限制，这里使用 HTTP 隧道方式
    
    // 设置 WebSocket 消息处理
    ws.on('message', async (data) => {
      try {
        // 处理来自客户端的数据
        await handleClientData(ws, address, port, data);
      } catch (error) {
        debugLog('Error handling client data:', error.message);
      }
    });

    // 如果有初始 payload，发送到目标
    if (payload && payload.length > 0) {
      await handleClientData(ws, address, port, payload);
    }

  } catch (error) {
    debugLog('Connection error:', error.message);
    // 发送错误响应
    const errorResponse = Buffer.concat([
      buildVlessResponse(),
      Buffer.from([0x00]) // 错误标志
    ]);
    ws.send(errorResponse);
    ws.close();
  }
}

/**
 * 处理客户端数据
 * 使用 HTTP 隧道方式转发数据
 */
async function handleClientData(ws, address, port, data) {
  debugLog(`Forwarding ${data.length} bytes to ${address}:${port}`);

  // 方案1: 如果目标是 HTTP 服务，可以直接转发
  // 方案2: 使用第三方中继服务
  
  // 这里提供一个基于 HTTP 的简单转发实现
  // 实际使用中可能需要更复杂的处理
  
  try {
    // 尝试作为 HTTP 请求处理
    const response = await fetch(`http://${address}:${port}/`, {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });

    const responseData = Buffer.from(await response.arrayBuffer());
    ws.send(responseData);
    
  } catch (error) {
    debugLog('Forward error:', error.message);
    
    // 如果 HTTP 方式失败，返回原始数据（回环测试用）
    // 生产环境需要更完善的处理
    ws.send(data);
  }
}

/**
 * 处理 UDP 代理 (简化实现)
 */
async function handleUdpProxy(ws, parsedRequest) {
  debugLog('UDP proxy requested (limited support)');
  
  // UDP 在 Vercel Functions 环境支持有限
  // 发送响应头
  const responseHeader = buildVlessResponse();
  ws.send(responseHeader);
  
  // UDP 数据处理需要特殊实现
  ws.on('message', (data) => {
    debugLog('UDP data received:', data.length, 'bytes');
    // UDP 数据转发逻辑
  });
}

/**
 * 调试日志
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Proxy]', ...args);
  }
}

module.exports = {
  handleTcpProxy,
  handleUdpProxy
};
