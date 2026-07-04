#!/bin/bash

# ============================================
# 部署脚本
# ============================================

echo "=== Vless Proxy Deployment ==="
echo ""

# 检查 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# 检查是否已登录
echo "Checking Vercel authentication..."
vercel whoami || vercel login

# 生成 UUID
echo ""
echo "Generating UUID..."
UUID=$(node -e "console.log(require('crypto').randomUUID())")
echo "UUID: $UUID"

# 更新配置文件
echo ""
echo "Updating config..."
sed -i "s/12345678-1234-1234-1234-123456789abc/$UUID/g" api/lib/config.js

# 部署
echo ""
echo "Deploying to Vercel..."
vercel --prod

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy your Vercel domain (e.g., your-app.vercel.app)"
echo "2. Configure your client with:"
echo "   - Server: your-app.vercel.app"
echo "   - Port: 443"
echo "   - UUID: $UUID"
echo "   - Network: ws"
echo "   - TLS: true"
echo "   - Path: /api/vless"
