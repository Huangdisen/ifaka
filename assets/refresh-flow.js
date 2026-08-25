import { refreshSubscription } from "./api-client.js";
import { getOperationRetryPolicy, parseSessionInfo } from "./domain.js";
import {
  setFormBusy,
  setStatus,
  showFieldError
} from "./ui.js";

export function initRefreshFlow() {
  const form = document.getElementById("refresh-form");
  const format = document.getElementById("refresh-format");
  const sessionInput = document.getElementById("refresh-session");
  const ownerConfirm = document.getElementById("refresh-owner-confirm");
  const status = document.getElementById("refresh-status");
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
        "请确认这是你本人账户的凭证。"
      );
      ownerConfirm.focus();
      return;
    }

    let sessionInfo;
    try {
      sessionInfo = parseSessionInfo(sessionInput.value, format.value);
    } catch (error) {
      setStatus(status, "error", "请检查凭证", error.message);
      sessionInput.focus();
      return;
    }

    setFormBusy(form, true, "正在刷新…");
    setStatus(status, "info", "正在刷新订阅", "请求不会自动重试。");

    try {
      const result = await refreshSubscription(sessionInfo);
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
        result.msg || result.code || "请检查凭证后再试。"
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
      sessionInput.value = "";
      ownerConfirm.checked = false;
      setFormBusy(form, false);
      syncSubmissionGuard();
    }
  });

  document.addEventListener("app:clear-sensitive", () => {
    sessionInput.value = "";
    ownerConfirm.checked = false;
  });
}
