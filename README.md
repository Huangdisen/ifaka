# iFaka 代理网站

这是一个通过iframe嵌入目标网站的代理页面，提供悬浮客服窗口功能。

## 🚀 Vercel部署指南

### 1. 准备工作
确保您已经安装了Node.js和Vercel CLI：
```bash
npm install -g vercel
```

### 2. 部署到Vercel
在项目根目录运行：
```bash
# 登录Vercel（如果尚未登录）
vercel login

# 部署到生产环境
vercel --prod
```

### 3. 配置自定义域名

#### 在Vercel控制台配置：
1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 找到您的项目 `ifaka-proxy`
3. 进入项目设置页面
4. 点击 "Domains" 选项卡
5. 添加您的自定义域名

#### 域名DNS配置：
在您的域名服务商处添加以下DNS记录：

**如果是根域名 (example.com)：**
```
Type: A
Name: @
Value: 76.76.19.88
```

**如果是子域名 (subdomain.example.com)：**
```
Type: CNAME
Name: subdomain
Value: cname.vercel-dns.com
```

#### 或者使用Vercel的nameservers：
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

### 4. 验证部署
- 部署完成后访问Vercel提供的域名测试功能
- DNS生效后访问您的自定义域名

## ⚙️ 项目配置

### vercel.json 配置说明
- 将所有路由重定向到 `index.html`
- 添加了安全头部配置
- 静态文件构建配置

### 注意事项
1. 确保目标网站支持iframe嵌入（检查X-Frame-Options）
2. 某些网站可能有反代理保护机制
3. 建议在部署前测试目标网站的可访问性

## 🔧 本地开发
```bash
# 安装依赖
npm install

# 本地开发服务器
vercel dev
```

## 📞 联系信息
如需修改客服信息，请编辑 `index.html` 中的相关部分。