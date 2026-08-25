import { initActivationFlow } from "./activation-flow.js";
import { initClaudeFlow } from "./claude-flow.js";
import { APP_CONFIG } from "./config.js";
import { initRefreshFlow } from "./refresh-flow.js";
import { clearSensitiveFields, setupSecretToggles } from "./ui.js";

const pathToPanel = new Map([
  ["/", "activation"],
  ["/recharge", "activation"],
  ["/refresh", "refresh"],
  ["/claude-refresh", "claude"],
  ["/batch", "batch"]
]);
const panelToPath = new Map([
  ["activation", "/"],
  ["refresh", "/refresh"],
  ["claude", "/claude-refresh"],
  ["batch", "/batch"]
]);
let activePanelName = null;

function activatePanel(panelName, updateHistory = true) {
  const target =
    document.querySelector('[data-panel="' + panelName + '"]') ||
    document.querySelector('[data-panel="activation"]');
  const resolved = target.dataset.panel;

  if (activePanelName === resolved) {
    return;
  }

  if (activePanelName !== null) {
    clearSensitiveState("panel-switch");
  }

  for (const button of document.querySelectorAll("[data-panel]")) {
    const selected = button === target;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }

  for (const panel of document.querySelectorAll("[data-panel-content]")) {
    panel.hidden = panel.dataset.panelContent !== resolved;
  }

  activePanelName = resolved;

  if (updateHistory) {
    const path = panelToPath.get(resolved) || "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }
}

function setupPanels() {
  for (const button of document.querySelectorAll("[data-panel]")) {
    button.addEventListener("click", () => activatePanel(button.dataset.panel));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const buttons = [...document.querySelectorAll("[data-panel]")];
      const current = buttons.indexOf(button);
      let next;

      if (event.key === "Home") {
        next = buttons[0];
      } else if (event.key === "End") {
        next = buttons.at(-1);
      } else {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        next = buttons[(current + offset + buttons.length) % buttons.length];
      }

      next.focus();
      activatePanel(next.dataset.panel);
    });
  }

  window.addEventListener("popstate", () => {
    activatePanel(pathToPanel.get(window.location.pathname) || "activation", false);
  });

  activatePanel(pathToPanel.get(window.location.pathname) || "activation", false);
}

function setupBatchNotice() {
  const badge = document.getElementById("batch-config-status");
  const action = document.getElementById("batch-action");

  if (APP_CONFIG.batchEnabled && APP_CONFIG.hcaptchaSitekey) {
    badge.textContent = "hCaptcha 已配置";
    badge.className = "inline-badge badge-success";
    action.textContent = "批量功能已配置，但生产换卡仍需使用专用测试卡验证。";
  } else {
    badge.textContent = "安全禁用";
    badge.className = "inline-badge badge-warning";
    action.textContent =
      "API v1.1 要求一次性 hCaptcha Token；当前文档未提供 sitekey，因此不会加载验证组件，也不会发送批量请求。";
  }
}

function clearSensitiveState(reason = "page-lifecycle") {
  document.dispatchEvent(
    new CustomEvent("app:clear-sensitive", { detail: { reason } })
  );
  clearSensitiveFields();
}

setupPanels();
setupSecretToggles();
setupBatchNotice();
initActivationFlow();
initRefreshFlow();
initClaudeFlow();

window.addEventListener("pagehide", () => clearSensitiveState("page-lifecycle"));
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    clearSensitiveState("page-lifecycle");
  }
});
