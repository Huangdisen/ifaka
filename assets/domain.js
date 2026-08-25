export const LIMITS = Object.freeze({
  card: 256,
  session: 32768,
  uid: 1024,
  batch: 50,
  captcha: 4096
});

const BLOCKED_STATUSES = new Set([
  "disabled",
  "exchanged",
  "expired",
  "invalid",
  "not_activatable",
  "not_eligible",
  "not_refreshable",
  "unavailable",
  "used",
  "voided"
]);
const ACTIVATABLE_STATUSES = new Set([
  "active",
  "available",
  "new",
  "not_used",
  "ready",
  "unused",
  "usable",
  "valid"
]);
const REFRESH_BLOCKED_STATUSES = new Set([
  "disabled",
  "exchanged",
  "expired",
  "invalid",
  "not_refreshable",
  "voided"
]);
const MANUAL_REVIEW_CODES = new Set([
  "cdk.not_activatable",
  "cdk.not_refreshable",
  "upstream.uncertain",
  "upstream.invalid_response"
]);
const COOLDOWN_CODES = new Set([
  "upstream.unavailable",
  "rate_limit_exceeded",
  "http.429"
]);

export function validateCard(rawValue) {
  const value = String(rawValue ?? "");

  if (!value) {
    throw new Error("请输入卡密。");
  }

  if (value !== value.trim()) {
    throw new Error("卡密首尾不能包含空格，请核对后重新输入。");
  }

  if (/[\r\n\t]/.test(value)) {
    throw new Error("卡密不能包含换行或制表符。");
  }

  if (value.length > LIMITS.card) {
    throw new Error("卡密不能超过 256 个字符。");
  }

  return value;
}

export function validateUid(rawValue) {
  const value = String(rawValue ?? "");

  if (!value) {
    throw new Error("请输入用户或账户 ID。");
  }

  if (value !== value.trim()) {
    throw new Error("用户 ID 首尾不能包含空格。");
  }

  if (value.length > LIMITS.uid) {
    throw new Error("用户 ID 不能超过 1024 个字符。");
  }

  return value;
}

export function parseSessionInfo(rawValue, format = "text") {
  const value = String(rawValue ?? "");

  if (!value) {
    throw new Error("请输入完整的 Session、Token 或 SessionKey。");
  }

  if (format === "json") {
    let parsed;

    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("JSON 凭证格式不正确，请检查括号、引号和逗号。");
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("JSON 凭证必须是一个对象。");
    }

    if (Object.keys(parsed).length > 50) {
      throw new Error("JSON 凭证最多允许 50 个字段。");
    }

    return parsed;
  }

  if (value.length > LIMITS.session) {
    throw new Error("凭证不能超过 32768 个字符。");
  }

  return value;
}

export function validateCheckData(rawData) {
  if (!rawData || Array.isArray(rawData) || typeof rawData !== "object") {
    throw new Error("卡密查询响应缺少有效的产品信息，已停止后续操作。");
  }

  const hasProduct = [
    rawData.app,
    rawData.service_product,
    rawData.product,
    rawData.product_name
  ].some((value) => typeof value === "string" && value.trim());
  const hasAvailability = ["available", "can_use", "can_recharge"].some(
    (field) => typeof rawData[field] === "boolean"
  ) || (typeof rawData.status === "string" && rawData.status.trim());

  if (!hasProduct || !hasAvailability) {
    throw new Error("卡密查询响应缺少产品或可用状态，已停止后续操作。");
  }

  return rawData;
}

export function getOperationRetryPolicy(source = {}) {
  const code = String(source.code || "");

  if (source.uncertain || MANUAL_REVIEW_CODES.has(code)) {
    return { action: "lock", delayMs: 0 };
  }

  if (
    source.httpStatus === 429 ||
    COOLDOWN_CODES.has(code)
  ) {
    return {
      action: "cooldown",
      delayMs: Math.max(Number(source.retryAfterMs) || 0, 60000)
    };
  }

  return { action: "allow", delayMs: 0 };
}

export function maskSensitive(rawValue, start = 4, end = 4) {
  const value = String(rawValue ?? "");

  if (!value) {
    return "—";
  }

  if (value.length <= start + end) {
    return "•".repeat(Math.max(4, value.length));
  }

  return value.slice(0, start) + "••••••" + value.slice(-end);
}

export function getProductLabel(data = {}) {
  return (
    data.product_name ||
    data.service_product ||
    data.product ||
    data.app ||
    "未命名产品"
  );
}

export function getProductCode(data = {}) {
  return data.service_product || data.product || data.app || "";
}

export function getActivationBlockReason(data = {}) {
  const booleanFlags = ["available", "can_use", "can_recharge"];

  for (const flag of booleanFlags) {
    if (data[flag] === false) {
      return "当前卡密状态不允许激活。";
    }
  }

  const status = String(data.status || "").trim().toLowerCase();
  if (BLOCKED_STATUSES.has(status)) {
    return "当前卡密状态为 " + status + "，不能继续激活。";
  }

  if (status && !ACTIVATABLE_STATUSES.has(status)) {
    return "服务端返回了未识别的卡密状态 " + status + "，已停止激活。";
  }

  return "";
}

export function getRefreshBlockReason(data = {}) {
  if (data.can_refresh === false) {
    return "服务端明确标记该卡密不可刷新。";
  }

  const status = String(data.status || "").trim().toLowerCase();
  if (REFRESH_BLOCKED_STATUSES.has(status)) {
    return "当前卡密状态为 " + status + "，不能继续刷新。";
  }

  return "";
}

export function isClaudeProduct(data = {}) {
  const searchable = [
    data.app,
    data.service_product,
    data.product,
    data.product_name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes("claude") || searchable.includes("anthropic");
}

export function validateBatchCards(rawValue) {
  const lines = String(rawValue ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  for (const card of lines) {
    if (card.length > LIMITS.card) {
      throw new Error("每张卡密不能超过 256 个字符。");
    }

    if (!seen.has(card)) {
      seen.add(card);
      unique.push(card);
    }
  }

  if (unique.length === 0) {
    throw new Error("请至少输入一张卡密。");
  }

  if (unique.length > LIMITS.batch) {
    throw new Error("每批最多处理 50 张卡密。");
  }

  return unique;
}
