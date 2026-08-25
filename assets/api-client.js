const API_BASE = "https://987ai.vip";

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code || "client.request_failed";
    this.httpStatus = options.httpStatus || 0;
    this.uncertain = Boolean(options.uncertain);
    this.retryAfterMs = Number(options.retryAfterMs) || 0;
    this.details = options.details || null;
  }
}

function validationMessage(body) {
  const detail = Array.isArray(body?.detail) ? body.detail[0] : null;
  if (!detail) {
    return "";
  }

  const field = Array.isArray(detail.loc) ? detail.loc.at(-1) : "";
  const message = detail.msg || "参数校验失败";
  return field ? field + "：" + message : message;
}

async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = 20000,
    consequential = false
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let response;
  let payload;

  try {
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      keepalive: false,
      signal: controller.signal
    });

    try {
      payload = await response.json();
    } catch (error) {
      if (timedOut || error?.name === "AbortError") {
        throw new ApiError(
          consequential
            ? "请求结果无法确认，请勿自动重试；请先查询状态或联系客服核查。"
            : "请求超时，请稍后手动重试。",
          {
            code: "client.timeout",
            httpStatus: response.status,
            uncertain: consequential
          }
        );
      }

      throw new ApiError(
        consequential
          ? "服务响应无法确认，请勿自动重试并联系客服核查。"
          : "服务器响应无法解析，请稍后手动重试。",
        {
          code: "response.invalid_json",
          httpStatus: response.status,
          uncertain: consequential || response.status >= 500
        }
      );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const requestTimedOut = timedOut || error?.name === "AbortError";
    const message = consequential
      ? "请求结果无法确认，请勿自动重试；请先查询状态或联系客服核查。"
      : requestTimedOut
        ? "请求超时，请稍后手动重试。"
        : "无法连接服务，请检查网络后手动重试。";

    throw new ApiError(message, {
      code: requestTimedOut ? "client.timeout" : "client.network_error",
      uncertain: consequential
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      payload?.msg ||
      validationMessage(payload) ||
      "请求失败（HTTP " + response.status + "）";

    throw new ApiError(message, {
      code: payload?.code || "http." + response.status,
      httpStatus: response.status,
      uncertain: consequential && response.status >= 500,
      retryAfterMs: response.status === 429 ? 60000 : 0,
      details: payload
    });
  }

  if (!payload || typeof payload.success !== "boolean") {
    throw new ApiError(
      consequential
        ? "服务响应结构异常，结果无法确认，请勿自动重试。"
        : "服务响应结构异常，请稍后手动重试。",
      {
        code: "response.invalid_shape",
        httpStatus: response.status,
        uncertain: consequential
      }
    );
  }

  return payload;
}

export function checkCard(cdkey) {
  return apiRequest("/api/check", {
    method: "POST",
    body: { cdkey },
    timeoutMs: 20000
  });
}

export function getServiceStatus(product) {
  return apiRequest("/api/service_status?product=" + encodeURIComponent(product), {
    timeoutMs: 15000
  });
}

export function activateCard(payload) {
  return apiRequest("/api/activate", {
    method: "POST",
    body: payload,
    timeoutMs: 45000,
    consequential: true
  });
}

export function refreshSubscription(sessionInfo) {
  return apiRequest("/api/refresh-subscription", {
    method: "POST",
    body: { session_info: sessionInfo },
    timeoutMs: 45000,
    consequential: true
  });
}

export function refreshClaude(cdkey, sessionInfo) {
  return apiRequest("/api/claude_refresh", {
    method: "POST",
    body: { cdkey, session_info: sessionInfo },
    timeoutMs: 45000,
    consequential: true
  });
}

export function batchCheck(cdkeys, captchaToken) {
  return apiRequest("/api/batch_check", {
    method: "POST",
    body: { cdkeys, captcha_token: captchaToken },
    timeoutMs: 30000
  });
}

export function batchExchange(cdkeys, captchaToken) {
  return apiRequest("/api/batch_exchange", {
    method: "POST",
    body: { cdkeys, captcha_token: captchaToken },
    timeoutMs: 60000,
    consequential: true
  });
}
