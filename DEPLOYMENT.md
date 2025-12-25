# Cloudflare 部署指南

## 前端部署（Cloudflare Pages）

### 步骤 1：准备部署文件

确保项目包含以下文件：
- `index.html`
- `i18n.js`
- `app.js`
- `locales/` 目录及其所有 JSON 文件

### 步骤 2：创建 Pages 项目

使用 Wrangler CLI 创建 Pages 项目：

```bash
wrangler pages project create ipgeek --production-branch main
```

### 步骤 3：部署前端文件

创建部署目录并复制文件：

```bash
mkdir -p dist
cp index.html app.js i18n.js dist/
cp -r locales dist/
```

部署到 Cloudflare Pages：

```bash
wrangler pages deploy dist --project-name ipgeek
```

部署成功后，你会看到类似以下的输出：

```
✨ Success! Uploaded 11 files (2.20 sec)
🌎 Deploying...
✨ Deployment complete! Take a peek over at https://xxx.ipgeek.pages.dev
```

### 步骤 4：配置自定义域名 ipgeek.top

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 选择 **ipgeek** Pages 项目
4. 点击 **Custom domains**
5. 点击 **Set up a custom domain**
6. 输入域名：`ipgeek.top`
7. 点击 **Activate domain**

Cloudflare 会自动配置 DNS 记录：
- CNAME 记录：`ipgeek.top` → `ipgeek.pages.dev`

等待 DNS 传播完成（通常几分钟到几小时），然后访问：
```
https://ipgeek.top
```

---

## 后端部署（Cloudflare Workers）

### 步骤 1：安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 步骤 2：登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器让你授权。

### 步骤 3：配置 wrangler.toml

编辑 `wrangler.toml` 文件，配置如下：

```toml
name = "ipgeek"
main = "workers/api.js"
compatibility_date = "2024-01-01"

[vars]
CACHE_TTL = "3600"

[[routes]]
pattern = "https://api.ipgeek.top/*"
zone_name = "ipgeek.top"
```

项目已配置为使用 `api.ipgeek.top` 作为 API 子域名。

### 步骤 4：部署 Worker

```bash
wrangler publish
```

部署成功后，你会看到类似以下的输出：

```
✨ Successfully published your Worker to
  https://ip-geo-intelligence-api.your-subdomain.workers.dev
```

---

## 配置 API 路由

### 选项 1：使用 Workers.dev 域名

如果你使用 Workers.dev 域名，需要修改 `app.js` 中的 API 基础 URL。

编辑 `app.js`，找到 `fetchIPData` 和 `fetchAndDisplayPOI` 函数，修改 API URL：

```javascript
async function fetchIPData(ip) {
  const response = await fetch(`https://ip-geo-intelligence-api.your-subdomain.workers.dev/ip/${ip}`);
  // ...
}

async function fetchAndDisplayPOI(lat, lng) {
  const response = await fetch(`https://ip-geo-intelligence-api.your-subdomain.workers.dev/poi?lat=${lat}&lng=${lng}`);
  // ...
}
```

### 选项 2：使用自定义域名（推荐）

如果你配置了自定义域名，API 请求会自动路由到 Worker，无需修改代码。

---

## 测试部署

### 测试前端

在浏览器中打开你的 Cloudflare Pages URL：
```
https://your-project.pages.dev
```

### 测试 API

```bash
curl https://api.ipgeek.top/ip/8.8.8.8
curl "https://api.ipgeek.top/poi?lat=37.38605&lng=-122.08385"
```

---

## 常见问题

### 1. IP API 返回 Rate Limited

ipapi.co 免费版有速率限制。你可以：
- 等待一段时间后重试
- 考虑使用其他 IP 地理位置服务（如 ip-api.com, geojs.io）

### 2. POI 查询超时

Overpass API 有时可能响应较慢。你可以：
- 减小查询半径
- 添加超时处理
- 考虑使用付费的 Overpass API 实例

### 3. CORS 错误

确保 Cloudflare Worker 返回了正确的 CORS 头：
```javascript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
}
```

---

## 监控和日志

### 查看 Worker 日志

```bash
wrangler tail
```

### 查看 Pages 日志

在 Cloudflare Dashboard 中：
1. 进入你的 Pages 项目
2. 点击 **Functions** 标签
3. 查看 **Real-time logs**

---

## 成本估算

### Cloudflare Pages
- **免费额度**：无限请求，无限带宽
- **成本**：$0/月

### Cloudflare Workers
- **免费额度**：每天 100,000 次请求
- **成本**：$0/月（在免费额度内）

### 总成本
- **MVP 阶段**：完全免费
- **超出免费额度**：$5/月起（Workers 计划）

---

## 更新部署

### 更新前端

1. 推送代码到 GitHub
2. Cloudflare Pages 会自动部署

### 更新后端

```bash
wrangler publish
```

---

## 安全建议

1. **API 速率限制**：在 Worker 中添加速率限制，防止滥用
2. **输入验证**：验证所有用户输入
3. **HTTPS**：Cloudflare 自动提供 HTTPS
4. **CORS**：根据需要限制 CORS 来源

---

## 下一步

- 添加分析工具（如 Cloudflare Web Analytics）
- 配置自定义错误页面
- 设置 CDN 缓存策略
- 添加监控告警
