# Vless Proxy Server for Vercel

基于 Vless 协议的代理服务器实现，部署在 Vercel Functions 上。

## 功能特性

- ✅ Vless 协议支持
- ✅ WebSocket 传输
- ✅ TLS 加密（Vercel 自动提供）
- ✅ UUID 认证
- ✅ TCP 代理

## 快速部署

### 1. 配置 UUID

编辑 `api/lib/config.js`，修改 `VALID_UUID`：

```javascript
const VALID_UUID = 'your-uuid-here';
```

生成 UUID：
```bash
node -e "console.log(crypto.randomUUID())"
```

### 2. 部署到 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

### 3. 获取部署地址

部署完成后，获得类似地址：
```
https://your-app.vercel.app
```

## 客户端配置

### Clash / Clash Meta

```yaml
proxies:
  - name: "vercel-vless"
    type: vless
    server: your-app.vercel.app
    port: 443
    uuid: your-uuid-here
    network: ws
    tls: true
    udp: true
    ws-opts:
      path: /api/vless
      headers:
        Host: your-app.vercel.app
```

### v2rayN / v2rayNG

```
vless://your-uuid-here@your-app.vercel.app:443?encryption=none&security=tls&type=ws&host=your-app.vercel.app&path=%2Fapi%2Fvless#vercel-vless
```

### Shadowrocket

```
Vless 协议:
- 地址: your-app.vercel.app
- 端口: 443
- UUID: your-uuid-here
- 传输方式: WebSocket
- TLS: 开启
- Path: /api/vless
```

## 本地测试

```bash
# 安装依赖
npm install

# 本地运行
vercel dev
```

## 文件结构

```
/api
  /vless.js           # WebSocket 入口
  /lib
    /config.js        # 配置
    /vless-parser.js  # 协议解析
    /proxy.js         # 代理处理
vercel.json           # Vercel 配置
package.json          # 依赖
```

## 注意事项

1. **执行时间限制**: Vercel Functions 有执行时间限制（免费版 10 秒，Pro 版 60 秒）
2. **出口 IP**: Vercel 的出口 IP 不固定
3. **合规使用**: 请确保在法律法规允许的范围内使用

## 技术原理

### Vless 协议结构

```
请求:
┌──────────┬─────────────┬──────────────┬──────────┬──────────┬──────────┐
│ Version  │   UUID(16B) │  Addons(LV)  │ Command  │  Address │  Payload │
│  (1B)    │             │              │  (1B)    │          │          │
└──────────┴─────────────┴──────────────┴──────────┴──────────┴──────────┘

响应:
┌──────────┬──────────────┬──────────┐
│ Version  │  Addons(LV)  │  Payload │
│  (1B)    │              │          │
└──────────┴──────────────┴──────────┘
```

## License

MIT - 仅供学习研究使用
