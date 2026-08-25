# iFaka · 987AI API v1.1 安全前端

这是一个直接调用 https://987ai.vip 用户端 API 的静态前端，用于卡密查询、激活、普通订阅刷新和 Claude 订阅刷新。

项目已从旧版 iframe 包装页迁移为原生 API 客户端。卡密、Session、Token、SessionKey 和用户 ID 不再进入 URL，也不会写入浏览器存储、日志或统计平台。

## 已实现

- POST /api/check：查询卡密与产品信息
- GET /api/service_status：按查询结果检查服务状态
- POST /api/activate：同步激活，提交前二次确认
- POST /api/refresh-subscription：普通订阅刷新
- POST /api/claude_refresh：先验证 Claude 卡密，再刷新订阅
- HTTP 状态、JSON success、业务 code 的分层错误处理
- upstream.uncertain、超时和 5xx 场景禁止自动重试
- 卡密工具改为“地址与卡密分离”，仅本地处理旧链接
- API v1.1 文档摘要页与完整 Markdown 文档
- CSP、无 Referrer、禁止被 iframe 嵌入、禁止缓存敏感页面

## 批量功能状态

POST /api/batch_check 和 POST /api/batch_exchange 需要有效的一次性 hCaptcha Token。

当前 API 文档没有提供 hCaptcha sitekey，因此生产前端按 fail-closed 原则禁用批量提交，不会加载验证组件或发送批量请求。获得官方 sitekey、登记正式域名并完成专用测试卡验证后再开放。

## 本地验证

需要 Node.js 20 或更高版本，以及 Vercel CLI：

    npm run verify
    vercel dev --listen 3000

本地服务默认运行在 http://localhost:3000。

## 部署

Vercel 项目 ifaka-proxy 已绑定 GitHub 仓库 Huangdisen/ifaka，生产分支为 main。推送 main 后由 Vercel Git Integration 自动创建生产部署。

主要生产域名：

- https://new.bearaiapp.com
- https://ios.891014.best
- https://ifaka-proxy.vercel.app

## 文档

完整接口文档：[docs/用户端API文档.md](docs/用户端API文档.md)

文档版本：v1.1

更新日期：2026-08-24
