import {
  checkCard,
  getServiceStatus,
  refreshClaude
} from "./api-client.js";
import {
  getOperationRetryPolicy,
  getRefreshBlockReason,
  isClaudeProduct,
  maskSensitive,
  parseSessionInfo,
  validateCard,
  validateCheckData
} from "./domain.js";
import {
  setFormBusy,
  setStatus,
  showFieldError
} from "./ui.js";

export function initClaudeFlow() {
  const form = document.getElementById("claude-form");
  const cardInput = document.getElementById("claude-card");
  const format = document.getElementById("claude-format");
  const sessionInput = document.getElementById("claude-session");
  const ownerConfirm = document.getElementById("claude-owner-confirm");
  const status = document.getElementById("claude-status");
  let manualReview = false;
  let cooldownUntil = 0;
  let cooldownTimer = 0;

  function syncSubmissionGuard() {
    window.clearTimeout(cooldownTimer);
    const submit = form.querySelector('button[type="submit"]');
    const remaining = Math.max(0, cooldownUntil - Date.now());
    submit.disabled = manualReview || remaining > 0;

    if (remaining > 0) {
      cooldownTimer = window.setTimeout(syncSubmissionGuard, remaining + 50);
    }
  }

  function applyOperationPolicy(source) {
    const policy = getOperationRetryPolicy(source);
    if (policy.action === "lock") {
      manualReview = true;
    } else if (policy.action === "cooldown") {
      cooldownUntil = Math.max(cooldownUntil, Date.now() + policy.delayMs);
    }
    return policy;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (manualReview || Date.now() < cooldownUntil) {
      setStatus(
        status,
        "warning",
        manualReview ? "请先人工核查" : "请稍后再试",
        manualReview
          ? "上一次刷新结果无法确认，本页面不会再次提交。"
          : "当前处于限流或服务冷却期，至少等待 60 秒。"
      );
      return;
    }

    if (!ownerConfirm.checked) {
      setStatus(
        status,
        "error",
        "需要账户确认",
        "请确认卡密与 SessionKey 均用于你本人的 Claude 账户。"
      );
      ownerConfirm.focus();
      return;
    }

    let card;
    let sessionInfo;
    try {
      card = validateCard(cardInput.value);
      sessionInfo = parseSessionInfo(sessionInput.value, format.value);
    } catch (error) {
      setStatus(status, "error", "请检查输入", error.message);
      return;
    }

    setFormBusy(form, true, "正在验证…");
    setStatus(status, "info", "正在验证 Claude 卡密", "验证通过后将立即刷新订阅。");

    try {
      const checked = await checkCard(card);
      if (!checked.success) {
        setStatus(
          status,
          "error",
          "卡密验证失败",
          checked.msg || checked.code || "请核对卡密。"
        );
        return;
      }

      const product = validateCheckData(checked.data);
      const returnedCard =
        typeof product.cdkey === "string" && product.cdkey
          ? validateCard(product.cdkey)
          : card;
      const blockedReason = getRefreshBlockReason(product);

      if (blockedReason) {
        setStatus(
          status,
          "warning",
          "卡密状态不允许刷新",
          blockedReason
        );
        return;
      }

      if (!isClaudeProduct(product)) {
        setStatus(
          status,
          "error",
          "产品类型不匹配",
          "该卡密未被识别为 Claude 产品，已停止刷新。"
        );
        return;
      }

      if (product.service_product) {
        const service = await getServiceStatus(product.service_product);
        if (!service.success || service.data?.level !== "normal") {
          const missingLevel = service.success && !service.data?.level;
          setStatus(
            status,
            "warning",
            "Claude 服务暂不可用",
            missingLevel
              ? "服务状态响应缺少 level=normal，已停止刷新。"
              : service.msg || "服务状态检查未通过。"
          );
          return;
        }
      }

      setStatus(
        status,
        "info",
        "正在刷新订阅",
        "卡密 " + maskSensitive(returnedCard) + " 已验证；请求不会自动重试。"
      );
      const result = await refreshClaude(returnedCard, sessionInfo);
      const policy = result.success
        ? { action: "allow", delayMs: 0 }
        : applyOperationPolicy(result);
      setStatus(
        status,
        result.success ? "success" : policy.action === "allow" ? "error" : "warning",
        result.success
          ? "刷新完成"
          : policy.action === "lock"
            ? "结果待核查"
            : policy.action === "cooldown"
              ? "已暂停重复提交"
              : "刷新未完成",
        result.msg || result.code || "请根据提示检查。"
      );
    } catch (error) {
      const policy = applyOperationPolicy(error);
      if (policy.action === "cooldown") {
        setStatus(
          status,
          "warning",
          "已暂停重复提交",
          error.message + " 请至少等待 60 秒。"
        );
      } else {
        showFieldError(status, error);
      }
    } finally {
      cardInput.value = "";
      sessionInput.value = "";
      ownerConfirm.checked = false;
      setFormBusy(form, false);
      syncSubmissionGuard();
    }
  });

  document.addEventListener("app:clear-sensitive", () => {
    cardInput.value = "";
    sessionInput.value = "";
    ownerConfirm.checked = false;
  });
}
