import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "api-docs.html",
  "card-tool.html",
  "assets/app.js",
  "assets/api-client.js",
  "assets/styles.css",
  "assets/sanitize-url.js",
  "docs/用户端API文档.md",
  "vercel.json"
];

for (const file of requiredFiles) {
  await access(file);
}

const [index, apiClient, appClient, cardToolClient, config, vercelRaw] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("assets/api-client.js", "utf8"),
  readFile("assets/app.js", "utf8"),
  readFile("assets/card-tool.js", "utf8"),
  readFile("assets/config.js", "utf8"),
  readFile("vercel.json", "utf8")
]);

const vercel = JSON.parse(vercelRaw);
const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

assert(!/<iframe\b/i.test(index), "首页不得包含 iframe");
assert(!/[?&]card=/i.test(index), "首页不得把卡密放入 URL");
assert(!/recharge[?&]card=/i.test(cardToolClient), "卡密工具不得生成包含卡密的 URL");
assert(
  !/localStorage|sessionStorage|indexedDB/i.test(apiClient + appClient + cardToolClient),
  "敏感流程不得使用浏览器持久化存储"
);

const expectedEndpoints = [
  "/api/check",
  "/api/service_status",
  "/api/activate",
  "/api/refresh-subscription",
  "/api/claude_refresh",
  "/api/batch_check",
  "/api/batch_exchange"
];

for (const endpoint of expectedEndpoints) {
  assert(apiClient.includes(endpoint), "缺少 API v1.1 端点：" + endpoint);
}

const retiredEndpoints = [
  "/api/tasks",
  "/api/parse-token",
  "/api/card-keys/"
];

for (const endpoint of retiredEndpoints) {
  assert(!apiClient.includes(endpoint), "仍在调用旧端点：" + endpoint);
}

assert(
  /batchEnabled:\s*false/.test(config) || /hcaptchaSitekey:\s*"[^"]+"/.test(config),
  "未配置 hCaptcha sitekey 时必须显式禁用批量功能"
);

const headerValues = (vercel.headers || [])
  .flatMap((entry) => entry.headers || [])
  .map((entry) => entry.key + ":" + entry.value)
  .join("\n");

assert(headerValues.includes("Content-Security-Policy:"), "缺少 Content-Security-Policy");
assert(headerValues.includes("connect-src 'self' https://987ai.vip"), "CSP 未允许 987AI API");
assert(headerValues.includes("X-Frame-Options:DENY"), "页面必须禁止被 iframe 嵌入");
assert(headerValues.includes("Referrer-Policy:no-referrer"), "Referrer-Policy 必须为 no-referrer");

if (failures.length) {
  for (const failure of failures) {
    process.stderr.write("FAIL: " + failure + "\n");
  }
  process.exit(1);
}

process.stdout.write("Static API v1.1 contract checks passed.\n");
