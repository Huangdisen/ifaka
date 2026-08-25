import { validateCard } from "./domain.js";
import {
  clearStatus,
  clearSensitiveFields,
  setStatus,
  setupSecretToggles
} from "./ui.js";

const shareForm = document.getElementById("secure-share-form");
const shareCard = document.getElementById("tool-card");
const shareStatus = document.getElementById("share-status");
const shareResult = document.getElementById("share-result");
const shareOutput = document.getElementById("share-output");
const extractForm = document.getElementById("legacy-extract-form");
const legacyLinks = document.getElementById("legacy-links");
const extractStatus = document.getElementById("extract-status");
const extractResult = document.getElementById("extract-result");
const extractOutput = document.getElementById("extract-output");

function safeDecode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return "";
  }
}

function extractCard(line) {
  let candidate = line.trim();
  if (!candidate) {
    return "";
  }

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = "https://" + candidate;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.searchParams.get("card") || "";
  } catch {
    const match = line.match(/[?&]card=([^&]*)/i);
    return match ? safeDecode(match[1]) : "";
  }
}

function invalidateShareResult() {
  shareOutput.textContent = "";
  shareResult.hidden = true;
  clearStatus(shareStatus);
}

function invalidateExtractResult() {
  extractOutput.textContent = "";
  extractResult.hidden = true;
  clearStatus(extractStatus);
}

shareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  shareResult.hidden = true;
  shareOutput.textContent = "";

  try {
    const card = validateCard(shareCard.value);
    const rechargeUrl = window.location.origin + "/recharge";
    shareOutput.textContent = "充值地址：" + rechargeUrl + "\n卡密：" + card;
    shareResult.hidden = false;
    setStatus(
      shareStatus,
      "success",
      "安全信息已生成",
      "卡密与网址已分离；复制内容仍含完整卡密，请谨慎发送。"
    );
  } catch (error) {
    setStatus(shareStatus, "error", "无法生成", error.message);
    shareCard.focus();
  }
});

extractForm.addEventListener("submit", (event) => {
  event.preventDefault();
  extractResult.hidden = true;
  extractOutput.textContent = "";
  const lines = legacyLinks.value.split(/\r?\n/).filter((line) => line.trim());
  const cards = [];
  const seen = new Set();
  let failures = 0;

  for (const line of lines) {
    const card = extractCard(line);
    let validatedCard;

    try {
      validatedCard = validateCard(card);
    } catch {
      failures += 1;
      continue;
    }

    if (!seen.has(validatedCard)) {
      seen.add(validatedCard);
      cards.push(validatedCard);
    }
  }

  if (cards.length === 0) {
    setStatus(
      extractStatus,
      "error",
      "未找到有效卡密",
      "请确认每行链接包含 card 查询参数。"
    );
    return;
  }

  extractOutput.textContent = cards.join("\n");
  extractResult.hidden = false;
  setStatus(
    extractStatus,
    failures ? "warning" : "success",
    "已提取 " + cards.length + " 张卡密",
    failures ? failures + " 行未能识别，已跳过。" : "全部链接均已处理。"
  );
});

for (const button of document.querySelectorAll("[data-copy-target]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target?.textContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(target.textContent);
      const original = button.textContent;
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      setStatus(
        button.closest(".utility-card").querySelector(".status-message"),
        "warning",
        "请手动复制",
        "浏览器未允许剪贴板权限，内容已选中。"
      );
    }
  });
}

setupSecretToggles();
shareCard.addEventListener("input", invalidateShareResult);
legacyLinks.addEventListener("input", invalidateExtractResult);

function clearGeneratedSecrets() {
  clearSensitiveFields();
  invalidateShareResult();
  invalidateExtractResult();
}

window.addEventListener("pagehide", clearGeneratedSecrets);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    clearGeneratedSecrets();
  }
});
