# 987AI 客户端 API 文档

> 文档版本：v1.1  
> 更新日期：2026-08-24  
> API Base URL：`https://987ai.vip`  
> 数据格式：JSON  
> 字符编码：UTF-8

---

## 1. 接入说明

### 1.1 请求地址

所有接口均以以下地址为基础：

```text
https://987ai.vip
```

例如，查询卡密接口的完整地址为：

```text
https://987ai.vip/api/check
```

### 1.2 请求头

POST 请求统一使用：

```http
Content-Type: application/json
```

当前用户端 API 不需要全局 `Authorization` 请求头。卡密、Session、Token、用户 ID 等凭证通过查询参数或 JSON 请求体传入。

### 1.3 通用响应约定

多数业务响应使用以下结构：

```json
{
  "success": true,
  "msg": "操作成功",
  "data": {}
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | boolean | 业务是否成功 |
| `code` | string | 业务错误代码；失败时可能返回 |
| `msg` | string | 面向用户的提示信息；部分本地错误可能不返回 |
| `data` | object / array / string / null | 业务数据；具体结构与接口和产品类型有关 |

重要说明：

- 部分业务失败仍会返回 HTTP `200`，客户端不能只判断 HTTP 状态码，必须同时检查 JSON 中的 `success`、`code` 以及批量结果中的逐项 `success`。
- 批量接口最外层 `success: true` 只表示批量请求已完成，不代表每一张卡都成功。
- 不要把用户的 Session、Token、SessionKey、用户 ID 或完整卡密写入日志、统计平台、异常上报或前端 URL。
- 卡密区分大小写。除非业务明确要求，否则客户端不要擅自转换大小写、去除中间字符或改写卡密。

### 1.4 HTTP 状态码

| HTTP 状态码 | 含义 |
|---|---|
| `200` | 请求已被处理；业务是否成功仍需查看响应 JSON |
| `413` | 请求体超过 1 MiB |
| `422` | 参数缺失、类型错误、长度超限或包含未声明字段 |
| `429` | 当前 IP 请求过于频繁 |
| `5xx` | 网关或服务异常；涉及激活、换卡时不要盲目重试 |

标准限流响应：

```json
{
  "success": false,
  "code": "rate_limit_exceeded",
  "msg": "Too many requests",
  "data": null
}
```

请求体过大响应：

```json
{
  "success": false,
  "code": "request_too_large",
  "msg": "Request body too large",
  "data": null
}
```

参数校验失败通常为 HTTP `422`，示例：

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "cdkey"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

### 1.5 接口限流

以下限流按客户端 IP 统计，窗口为 60 秒：

| 接口 | 限制 |
|---|---:|
| `POST /api/check` | 30 次/分钟/IP |
| `GET /api/service_status` | 30 次/分钟/IP |
| `POST /api/activate` | 10 次/分钟/IP |
| `POST /api/refresh-subscription` | 5 次/分钟/IP |
| `POST /api/claude_refresh` | 10 次/分钟/IP |
| `POST /api/batch_check` | 6 次/分钟/IP |
| `POST /api/batch_exchange` | 3 次/分钟/IP |

---

## 2. 接口总览

| # | 方法 | 路径 | 功能 |
|---:|---|---|---|
| 1 | POST | `/api/check` | 查询单张卡密及对应产品信息 |
| 2 | GET | `/api/service_status` | 查询指定服务产品的可用状态 |
| 3 | POST | `/api/activate` | 使用卡密进行充值/激活 |
| 4 | POST | `/api/refresh-subscription` | 刷新 ChatGPT 等产品的订阅信息 |
| 5 | POST | `/api/claude_refresh` | 使用 Claude 卡密和 SessionKey 刷新订阅 |
| 6 | POST | `/api/batch_check` | 批量查询卡密 |
| 7 | POST | `/api/batch_exchange` | 批量换卡 |


---

## 3. 查询单张卡密

### 3.1 接口

```http
POST /api/check
```

### 3.2 请求体

```json
{
  "cdkey": "AbCdEf1234567890"
}
```

字段说明：

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---:|---|---|
| `cdkey` | string | 是 | 1～256 个字符 | 用户购买的 987AI 卡密，区分大小写 |

不允许提交未声明字段。

### 3.3 成功响应

成功时，`data` 会返回卡密对应的产品与可用状态。不同产品返回字段可能不同，客户端应兼容扩展字段，不要只依赖固定字段数量。

代表性示例：

```json
{
  "success": true,
  "msg": "查询成功",
  "data": {
    "cdkey": "AbCdEf1234567890",
    "app": "gpt",
    "service_product": "产品服务代码",
    "product_name": "产品名称",
    "available": true
  }
}
```

客户端建议：

1. 首先判断 `success === true`。
2. 再根据 `data.available`、`data.can_use`、`data.can_recharge`、`data.status` 或服务端返回的提示判断是否允许进入激活流程。
3. 产品类型应优先依据 `data.app`、`data.service_product`、`data.product` 等服务端字段，不要仅凭客户端页面入口猜测。
4. 后续提交激活时，应使用响应中的 `data.cdkey`；若服务端未返回该字段，则使用原始卡密。

### 3.4 卡密不存在

```json
{
  "success": false,
  "code": "cdk.not_found"
}
```

### 3.5 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/check' \
  -H 'Content-Type: application/json' \
  --data '{"cdkey":"AbCdEf1234567890"}'
```

---

## 4. 查询服务状态

### 4.1 接口

```http
GET /api/service_status?product=<service_product>
```

### 4.2 查询参数

| 参数 | 类型 | 必填 | 限制 | 说明 |
|---|---|---:|---|---|
| `product` | string | 是 | 1～100 个字符 | `/api/check` 成功响应中返回的 `data.service_product` |

不要自行写死 `gpt`、`claude` 等值。应先调用 `/api/check`，并把服务端返回的 `service_product` 原样传入。

### 4.3 响应示例

```json
{
  "success": true,
  "msg": "服务正常",
  "data": {
    "level": "normal"
  }
}
```

`data.level === "normal"` 通常表示当前服务可以正常处理。其他状态应展示服务端 `msg`，并避免继续高频重试。

### 4.4 curl 示例

```bash
curl 'https://987ai.vip/api/service_status?product=<URL编码后的service_product>'
```

---

## 5. 充值/激活

### 5.1 接口

```http
POST /api/activate
```

此接口为同步接口，不会返回旧卡网文档中的 `task_id`，客户端不需要轮询任务状态。

### 5.2 请求字段

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---:|---|---|
| `cdkey` | string | 是 | 1～256 个字符 | 已通过 `/api/check` 验证的卡密 |
| `session_info` | string / object | 条件必填 | 字符串最长 32768；对象最多 50 个键 | Session、Token 或产品要求的登录凭证 |
| `uid` | string | 条件必填 | 1～1024 个字符 | 某些产品要求的用户/账户 ID |
| `force` | boolean / integer | 否 | `true`、`false`、`1` 或 `0` | 是否覆盖充值，默认关闭 |

`session_info` 与 `uid` 如何选择：

- 普通 ChatGPT、Claude SessionKey 等凭证型产品通常提交 `session_info`。
- 当 `/api/check` 返回的产品说明要求用户 ID、Account ID、Organization ID 等标识时，提交 `uid`。
- 不要同时随意提交两者；应根据卡密查询结果和产品页面提示选择。
- `force` 仅在产品明确支持覆盖充值时使用。覆盖充值通常不会叠加剩余时长，可能直接开始新的订阅周期。
- 请求体不允许额外字段。

### 5.3 使用 Session/Token 激活

```json
{
  "cdkey": "AbCdEf1234567890",
  "session_info": "<用户自己的Session或Token>",
  "force": 0
}
```

### 5.4 使用用户 ID 激活

```json
{
  "cdkey": "AbCdEf1234567890",
  "uid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "force": 0
}
```

### 5.5 成功响应

```json
{
  "success": true,
  "msg": "充值成功",
  "data": {}
}
```

实际 `data` 字段随产品变化，客户端应保留并显示 `msg`。

### 5.6 常见失败

卡密不存在：

```json
{
  "success": false,
  "code": "cdk.not_found"
}
```

卡密当前不可激活：

```json
{
  "success": false,
  "code": "cdk.not_activatable",
  "status": "used"
}
```

上游服务暂不可用：

```json
{
  "success": false,
  "code": "upstream.unavailable"
}
```

激活结果不确定：

```json
{
  "success": false,
  "code": "upstream.uncertain"
}
```

当收到 `upstream.uncertain` 时，上游可能已经完成操作，但本系统未能确认最终结果。客户端必须停止自动重试，保留卡密和发生时间，并引导用户联系客服核查。

### 5.7 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/activate' \
  -H 'Content-Type: application/json' \
  --data '{
    "cdkey":"AbCdEf1234567890",
    "session_info":"<用户自己的Session或Token>",
    "force":0
  }'
```

---

## 6. 刷新普通订阅信息

### 6.1 接口

```http
POST /api/refresh-subscription
```

适用于 ChatGPT 等使用 Session/Token 的产品。此接口不需要卡密。

### 6.2 请求体

```json
{
  "session_info": "<用户自己的Session或Token>"
}
```

`session_info` 也可以是 JSON 对象：

```json
{
  "session_info": {
    "accessToken": "<Token>"
  }
}
```

字段限制：

| 字段 | 类型 | 必填 | 限制 |
|---|---|---:|---|
| `session_info` | string / object | 是 | 字符串 1～32768 个字符；对象最多 50 个键 |

### 6.3 成功响应

```json
{
  "success": true,
  "msg": "订阅信息刷新成功",
  "data": {}
}
```

### 6.4 无效凭证示例

```json
{
  "success": false,
  "msg": "Session或Token格式异常，请完整复制后重新提交",
  "data": "",
  "code": "account.session_invalid"
}
```

### 6.5 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/refresh-subscription' \
  -H 'Content-Type: application/json' \
  --data '{"session_info":"<用户自己的Session或Token>"}'
```

---

## 7. 刷新 Claude 订阅信息

### 7.1 接口

```http
POST /api/claude_refresh
```

该接口需要 Claude 产品卡密以及用户自己的 Claude SessionKey。

### 7.2 请求体

```json
{
  "cdkey": "AbCdEf1234567890",
  "session_info": "sk-ant-sid..."
}
```

字段说明：

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---:|---|---|
| `cdkey` | string | 是 | 1～256 个字符 | Claude 产品卡密 |
| `session_info` | string / object | 否，但业务通常需要 | 字符串最长 32768；对象最多 50 个键 | Claude SessionKey，通常包含 `sk-ant-sid` |

### 7.3 成功响应

```json
{
  "success": true,
  "msg": "订阅信息刷新成功",
  "data": {}
}
```

### 7.4 常见失败

卡密不存在：

```json
{
  "success": false,
  "code": "cdk.not_found"
}
```

卡密状态不允许刷新：

```json
{
  "success": false,
  "code": "cdk.not_refreshable",
  "status": "voided"
}
```

### 7.5 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/claude_refresh' \
  -H 'Content-Type: application/json' \
  --data '{
    "cdkey":"AbCdEf1234567890",
    "session_info":"sk-ant-sid..."
  }'
```

---

## 8. 批量接口通用规则

批量接口包括：

- `/api/batch_check`
- `/api/batch_exchange`

统一请求格式：

```json
{
  "cdkeys": [
    "AbCdEf1234567890",
    "XyZ9876543210000"
  ],
  "captcha_token": "<hCaptcha Token>"
}
```

字段说明：

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---:|---|---|
| `cdkeys` | string[] | 是 | 1～50 项 | 卡密数组，每项 1～256 个字符 |
| `captcha_token` | string | 是 | 1～4096 个字符 | 用户完成人机验证后获得的一次性 hCaptcha Token |

规则：

- 请求模型为严格模式，不允许额外字段。
- `cdkeys` 中的值必须是字符串，数字等类型不会自动转换。
- 卡密区分大小写。
- 重复卡密会按精确字符串去重，并保留第一次出现的顺序。
- hCaptcha Token 应由用户在官方页面完成验证后获得，不得伪造、复用或绕过验证。


批量成功外层结构：

```json
{
  "success": true,
  "msg": "Batch check completed",
  "data": {
    "results": [],
    "total_count": 0,
    "success_count": 0,
    "fail_count": 0
  }
}
```

计数字段：

| 字段 | 说明 |
|---|---|
| `total_count` | 去重后返回的结果总数 |
| `success_count` | `results` 中 `success === true` 的数量 |
| `fail_count` | 其余结果数量 |

常见逐项状态：

| `status` | 说明 |
|---|---|
| `not_found` | 本系统中不存在该卡密 |
| `not_eligible` | 卡密存在，但当前状态不允许换卡 |
| `upstream_missing` | 上游响应中缺少该卡密对应结果 |
| `used` | 已使用，具体是否可继续操作以接口返回为准 |
| `voided` | 已销毁 |
| `exchanged` | 已换卡 |

`not_eligible` 示例：

```json
{
  "cdkey": "AbCdEf1234567890",
  "success": false,
  "status": "not_eligible",
  "card_status": "used"
}
```

---

## 9. 批量查询卡密

### 9.1 接口

```http
POST /api/batch_check
```

### 9.2 请求体

```json
{
  "cdkeys": [
    "AbCdEf1234567890",
    "XyZ9876543210000"
  ],
  "captcha_token": "<hCaptcha Token>"
}
```

### 9.3 响应示例

```json
{
  "success": true,
  "msg": "Batch check completed",
  "data": {
    "results": [
      {
        "cdkey": "AbCdEf1234567890",
        "success": true,
        "status": "unused"
      },
      {
        "cdkey": "XyZ9876543210000",
        "success": false,
        "status": "not_found"
      }
    ],
    "total_count": 2,
    "success_count": 1,
    "fail_count": 1
  }
}
```

### 9.4 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/batch_check' \
  -H 'Content-Type: application/json' \
  --data '{
    "cdkeys":["AbCdEf1234567890","XyZ9876543210000"],
    "captcha_token":"<hCaptcha Token>"
  }'
```

---

## 10. 批量换卡

### 10.1 接口

```http
POST /api/batch_exchange
```

此操作会使成功换卡的旧卡密失效，并返回新的 987AI 卡密。操作不可逆，调用前必须让用户明确确认。

### 10.2 请求体

```json
{
  "cdkeys": [
    "AbCdEf1234567890"
  ],
  "captcha_token": "<hCaptcha Token>"
}
```

### 10.3 成功响应

```json
{
  "success": true,
  "msg": "Batch exchange completed",
  "data": {
    "results": [
      {
        "cdkey": "AbCdEf1234567890",
        "success": true,
        "status": "exchanged",
        "new_cdkey": "NewCard123456789"
      }
    ],
    "total_count": 1,
    "success_count": 1,
    "fail_count": 0
  }
}
```

客户端必须立即把 `new_cdkey` 完整展示给用户，并提供复制功能。不要只依据最外层 `success` 判断换卡成功。

### 10.4 卡密不可换示例

```json
{
  "success": true,
  "msg": "Batch exchange completed",
  "data": {
    "results": [
      {
        "cdkey": "AbCdEf1234567890",
        "success": false,
        "status": "not_eligible",
        "card_status": "used"
      }
    ],
    "total_count": 1,
    "success_count": 0,
    "fail_count": 1
  }
}
```

### 10.5 curl 示例

```bash
curl -X POST 'https://987ai.vip/api/batch_exchange' \
  -H 'Content-Type: application/json' \
  --data '{
    "cdkeys":["AbCdEf1234567890"],
    "captcha_token":"<hCaptcha Token>"
  }'
```

---

## 11. 未公开的销毁操作

为避免普通客户端误调用不可逆的永久销毁操作，生产环境不公开 `POST /api/batch_void`。客户端不得调用、探测或自行兼容该路径；请求该路径会返回 HTTP `404`。

如确有卡密作废需求，应由客服或管理员在完成身份、订单和卡密归属核验后，通过内部管理流程处理。

---

## 12. 错误代码参考

下表为客户端需要重点处理的本系统错误。上游产品还可能返回其他业务代码和中文 `msg`，客户端应显示服务端提示，并兼容新增错误代码。

| `code` | 含义 | 客户端处理建议 |
|---|---|---|
| `cdk.not_found` | 卡密不存在 | 提示用户核对卡密，保留大小写 |
| `cdk.not_activatable` | 卡密状态不允许激活 | 显示返回的 `status`，不要重复提交 |
| `cdk.not_refreshable` | 卡密状态不允许刷新 | 显示返回的 `status` |
| `upstream.unavailable` | 上游服务暂不可用 | 稍后人工重试；激活场景先查询卡密状态 |
| `upstream.uncertain` | 操作结果不确定 | 禁止自动重试，联系人工核查 |
| `upstream.invalid_response` | 上游响应异常 | 停止操作并联系客服 |
| `upstream_error` | 批量上游请求失败 | 不要根据空结果认定卡密失败；稍后核查 |
| `account.session_invalid` | Session/Token 无效或格式不完整 | 要求用户重新获取完整凭证 |
| `input.invalid` | 参数不符合对应产品要求 | 根据 `/api/check` 返回字段重新组装请求 |
| `rate_limit_exceeded` | 请求频率过高 | 指数退避，至少等待当前限流窗口 |
| `request_too_large` | 请求体超过 1 MiB | 减少批量数量或凭证体积 |

批量上游错误示例：

```json
{
  "success": false,
  "code": "upstream_error",
  "msg": "Upstream batch request failed",
  "data": {
    "results": [],
    "total_count": 0,
    "success_count": 0,
    "fail_count": 0
  }
}
```

---

## 13. 推荐客户端流程

### 13.1 单卡充值

1. 用户输入卡密。
2. 调用 `POST /api/check`。
3. 判断 `success` 与卡密可用状态。
4. 如果响应含 `service_product`，调用 `GET /api/service_status`。
5. 根据返回的产品类型，引导用户获取自己的 Session/Token/SessionKey 或用户 ID。
6. 展示目标账号和覆盖充值风险，让用户确认。
7. 调用 `POST /api/activate`。
8. 根据 `success`、`code`、`msg` 展示结果。
9. 若返回 `upstream.uncertain`，立即停止自动重试并转人工核查。

### 13.2 自助换卡

1. 用户输入旧卡密。
2. 用户完成人机验证。
3. 明确提示“旧卡将失效，新卡需立即保存”。
4. 调用 `POST /api/batch_exchange`，即使只换一张卡也使用数组。
5. 同时检查最外层和 `data.results[0]` 的 `success`。
6. 成功后展示并允许复制 `new_cdkey`。

### 13.3 批量操作

1. 客户端先限制为最多 50 张卡。
2. 保留卡密原始大小写。
3. 查询和换卡前完成人机验证。
4. 调用对应批量接口。
5. 按 `data.results` 逐项展示，不得以最外层 `success` 代替逐项结果。
6. 对换卡操作不进行网络层自动重试。

---

## 14. JavaScript 调用示例

```javascript
const API_BASE = 'https://987ai.vip';

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({
    success: false,
    code: 'response.invalid_json',
    msg: '服务器响应无法解析',
    data: null
  }));

  if (!response.ok) {
    throw new Error(body.msg || `HTTP ${response.status}`);
  }

  return body;
}

async function checkCard(cdkey) {
  return apiRequest('/api/check', {
    method: 'POST',
    body: JSON.stringify({ cdkey })
  });
}

async function activateCard(cdkey, sessionInfo, force = false) {
  return apiRequest('/api/activate', {
    method: 'POST',
    body: JSON.stringify({
      cdkey,
      session_info: sessionInfo,
      force
    })
  });
}
```

调用时仍需检查业务结果：

```javascript
const result = await checkCard('AbCdEf1234567890');

if (!result.success) {
  console.error(result.code, result.msg || '卡密不可用');
} else {
  console.log(result.data);
}
```

---

## 15. Python 调用示例

```python
import requests

API_BASE = "https://987ai.vip"


def check_card(cdkey: str) -> dict:
    response = requests.post(
        f"{API_BASE}/api/check",
        json={"cdkey": cdkey},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


result = check_card("AbCdEf1234567890")
if result.get("success"):
    print(result.get("data"))
else:
    print(result.get("code"), result.get("msg", "卡密不可用"))
```

涉及激活和换卡时，建议设置合理超时，但不要在超时后自动重复提交。

---

## 16. 与旧卡网客户端 API 的主要区别

本系统不是旧卡网 API 的同路径复制，接入时请按本文档修改客户端：

| 旧客户端概念 | 987AI 当前接口 |
|---|---|
| `GET /api/card-keys/:cardCode` | `POST /api/check`，卡密放在 JSON 的 `cdkey` 字段 |
| `POST /api/parse-token` | 无独立公开解析接口；凭证直接按产品流程提交 |
| `POST /api/tasks` | `POST /api/activate`，同步返回结果 |
| 任务状态轮询/取消/批量任务查询 | 当前不使用任务队列接口，无需轮询 `task_id` |
| `POST /api/card-keys/batch-query` | `POST /api/batch_check` |
| `POST /api/check-account` | `POST /api/refresh-subscription` 或 `/api/claude_refresh` |
| `POST /api/card-keys/replace` | `POST /api/batch_exchange`，单张换卡也使用数组 |

请勿继续调用旧文档中的 `/api/tasks`、`/api/parse-token`、`/api/card-keys/*` 等路径。

---

## 17. 安全要求

- 只允许用户提交其本人账号的 Session、Token、SessionKey 或账户 ID。
- 客户端不得收集、持久化或向第三方上传用户凭证。
- 不要把凭证放入 URL 查询参数。
- HTTPS 证书校验必须开启，禁止为解决网络问题关闭 TLS 校验。
- 卡密、旧卡与新卡都属于敏感信息，不应完整记录到日志。
- hCaptcha Token 为短时一次性凭证，不应缓存或复用。
- 换卡属于不可逆操作，必须二次确认。
- 激活或换卡发生超时、网络断开、`5xx`、`upstream.uncertain` 时，不得自动重试，应先查询状态或联系人工核查。

---

## 18. 联调检查清单

- [ ] Base URL 使用 `https://987ai.vip`
- [ ] POST 请求包含 `Content-Type: application/json`
- [ ] 客户端同时判断 HTTP 状态与 JSON `success`
- [ ] 批量接口逐项判断 `data.results[*].success`
- [ ] 卡密保持原始大小写
- [ ] 单批不超过 50 张卡
- [ ] 查询/换卡提交有效 hCaptcha Token
- [ ] `service_status` 使用 `/api/check` 返回的 `service_product`
- [ ] Session、Token、SessionKey 不进入日志和 URL
- [ ] 激活、换卡不做自动重试
- [ ] 正确处理 `429`、`422`、`upstream.uncertain`

---

文档结束。
