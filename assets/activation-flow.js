import {
  activateCard,
  checkCard,
  getServiceStatus
} from "./api-client.js";
import {
  getActivationBlockReason,
  getOperationRetryPolicy,
  getProductCode,
  getProductLabel,
  maskSensitive,
  parseSessionInfo,
  validateCard,
  validateCheckData,
  validateUid
} from "./domain.js";
import {
  clearStatus,
  renderDetails,
  setFormBusy,
  setStatus,
  showFieldError
} from "./ui.js";

export function initActivationFlow() {
  const checkForm = document.getElementById("card-check-form");
  const activationForm = document.getElementById("activation-form");
  const cardInput = document.getElementById("activation-card");
  const checkStatus = document.getElementById("card-check-status");
  const activationStatus = document.getElementById("activation-status");
  const summary = document.getElementById("card-summary");
  const summaryDetails = document.getElementById("card-summary-details");
  const serviceLabel = document.getElementById("service-status");
  const sessionGroup = document.getElementById("activation-session-group");
  const uidGroup = document.getElementById("activation-uid-group");
  const sessionFormat = document.getElementById("activation-format");
  const sessionInput = document.getElementById("activation-session");
  const uidInput = document.getElementById("activation-uid");
  const ownerConfirm = document.getElementById("activation-owner-confirm");
  const dialog = document.getElementById("activation-dialog");
  const dialogSummary = document.getElementById("activation-dialog-summary");
  const finalConfirm = document.getElementById("activation-final-confirm");
  const dialogSubmit = document.getElementById("activation-dialog-submit");
  const dialogCancel = document.getElementById("activation-dialog-cancel");

  const state = {
    card: "",
    product: null,
    pendingPayload: null,
    blockedCards: new Set(),
    cooldownUntil: 0,
    checkCooldownUntil: 0,
    operationInFlight: false,
    epoch: 0
  };
  let cooldownTimer = 0;
  let checkCooldownTimer = 0;

  function resetResult() {
    state.epoch += 1;
    state.card = "";
    state.product = null;
    state.pendingPayload = null;
    summary.hidden = true;
    activationForm.hidden = true;
    serviceLabel.textContent = "尚未检查";
    sessionInput.value = "";
    uidInput.value = "";
    ownerConfirm.checked = false;
    clearStatus(checkStatus);
    clearStatus(activationStatus);
  }

  function syncActivationGuard() {
    window.clearTimeout(cooldownTimer);
    const submit = activationForm.querySelector('button[type="submit"]');
    const blocked = Boolean(state.card && state.blockedCards.has(state.card));
    const remaining = Math.max(0, state.cooldownUntil - Date.now());
    submit.disabled = state.operationInFlight || blocked || remaining > 0;

    if (remaining > 0) {
      cooldownTimer = window.setTimeout(syncActivationGuard, remaining + 50);
    }
  }

  function syncCheckGuard() {
    window.clearTimeout(checkCooldownTimer);
    const submit = checkForm.querySelector('button[type="submit"]');
    const remaining = Math.max(0, state.checkCooldownUntil - Date.now());
    submit.disabled = state.operationInFlight || remaining > 0;

    if (remaining > 0) {
      checkCooldownTimer = window.setTimeout(syncCheckGuard, remaining + 50);
    }
  }

  function applyOperationPolicy(source, operationCard = state.card) {
    const policy = getOperationRetryPolicy(source);

    if (policy.action === "lock" && operationCard) {
      state.blockedCards.add(operationCard);
      if (state.card === operationCard) {
        activationForm.hidden = true;
      }
    } else if (policy.action === "cooldown") {
      state.cooldownUntil = Math.max(
        state.cooldownUntil,
        Date.now() + policy.delayMs
      );
    }

    syncActivationGuard();
    return policy;
  }

  function applyCheckPolicy(source) {
    const policy = getOperationRetryPolicy(source);
    if (policy.action === "cooldown") {
      state.checkCooldownUntil = Math.max(
        state.checkCooldownUntil,
        Date.now() + policy.delayMs
      );
    }
    syncCheckGuard();
    return policy;
  }

  function clearFlowState(event) {
    if (dialog.open) {
      dialog.close();
    }
    cardInput.value = "";
    sessionFormat.value = "text";
    resetResult();

    if (event.detail?.reason === "page-lifecycle") {
      state.blockedCards.clear();
    }

    syncActivationGuard();
    syncCheckGuard();
  }

  function selectedCredentialType() {
    return document.querySelector('input[name="activation-credential-type"]:checked')?.value || "session";
  }

  function syncCredentialFields() {
    const useUid = selectedCredentialType() === "uid";
    sessionGroup.hidden = useUid;
    uidGroup.hidden = !useUid;
    sessionInput.required = !useUid;
    uidInput.required = useUid;
    if (useUid) {
      sessionInput.value = "";
    } else {
      uidInput.value = "";
    }
  }

  async function verifyService(data, epoch) {
    const product = data.service_product;
    if (!product) {
      serviceLabel.textContent = "该产品未要求单独检查服务状态";
      return true;
    }

    serviceLabel.textContent = "正在检查服务状态…";
    const result = await getServiceStatus(product);

    if (epoch !== state.epoch) {
      return false;
    }

    if (!result.success) {
      setStatus(
        checkStatus,
        "error",
        "服务当前不可用",
        result.msg || "服务状态检查未通过，请稍后手动重试。"
      );
      serviceLabel.textContent = result.code || "检查失败";
      return false;
    }

    const level = result.data?.level;
    serviceLabel.textContent = level || "响应异常";

    if (level !== "normal") {
      setStatus(
        checkStatus,
        "warning",
        "服务暂不可用",
        level
          ? result.msg || "当前服务状态不是 normal，请稍后再试。"
          : "服务状态响应缺少 level=normal，已停止后续操作。"
      );
      return false;
    }

    serviceLabel.textContent = result.msg || level;

    return true;
  }

  checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (state.operationInFlight) {
      setStatus(
        checkStatus,
        "warning",
        "激活正在处理中",
        "请等待当前激活请求完成后再查询其他卡密。"
      );
      return;
    }

    if (Date.now() < state.checkCooldownUntil) {
      setStatus(
        checkStatus,
        "warning",
        "查询暂时受限",
        "请至少等待 60 秒后再查询。"
      );
      return;
    }

    resetResult();
    const epoch = state.epoch;

    let card;
    try {
      card = validateCard(cardInput.value);
    } catch (error) {
      setStatus(checkStatus, "error", "请检查卡密", error.message);
      cardInput.focus();
      return;
    }

    setFormBusy(checkForm, true, "正在查询…");
    setStatus(checkStatus, "info", "正在查询卡密", "卡密大小写将保持不变。");

    try {
      const result = await checkCard(card);
      if (epoch !== state.epoch) {
        return;
      }

      if (!result.success) {
        const policy = applyCheckPolicy(result);
        setStatus(
          checkStatus,
          policy.action === "cooldown" ? "warning" : "error",
          policy.action === "cooldown" ? "查询已暂停" : "卡密查询失败",
          result.msg || result.code || "请核对卡密后重试。"
        );
        return;
      }

      const data = validateCheckData(result.data);
      const returnedCard =
        typeof data.cdkey === "string" && data.cdkey
          ? validateCard(data.cdkey)
          : card;

      state.card = returnedCard;
      state.product = data;

      renderDetails(summaryDetails, [
        ["产品", getProductLabel(data)],
        ["服务代码", getProductCode(data) || "未提供"],
        ["卡密", maskSensitive(returnedCard)],
        ["状态", String(data.status || "可查询")]
      ]);
      summary.hidden = false;

      const blockedReason = getActivationBlockReason(data);
      if (blockedReason) {
        setStatus(checkStatus, "warning", "当前不可激活", blockedReason);
        return;
      }

      if (state.blockedCards.has(returnedCard)) {
        setStatus(
          checkStatus,
          "warning",
          "该卡密需要人工核查",
          "本页面此前收到不可重试的结果，已阻止再次激活。"
        );
        return;
      }

      const serviceAvailable = await verifyService(data, epoch);
      if (!serviceAvailable) {
        return;
      }

      clearStatus(checkStatus);
      setStatus(
        activationStatus,
        "info",
        "卡密验证通过",
        "请选择该产品要求的凭证类型。未知时请先咨询客服。"
      );
      activationForm.hidden = false;
      syncActivationGuard();
      sessionInput.focus();
    } catch (error) {
      const policy = applyCheckPolicy(error);
      if (policy.action === "cooldown") {
        setStatus(
          checkStatus,
          "warning",
          "查询已暂停",
          error.message + " 请至少等待 60 秒。"
        );
      } else {
        showFieldError(checkStatus, error);
      }
    } finally {
      setFormBusy(checkForm, false);
      syncCheckGuard();
    }
  });

  cardInput.addEventListener("input", () => {
    if (state.card || checkForm.getAttribute("aria-busy") === "true") {
      resetResult();
    }
  });

  for (const radio of document.querySelectorAll('input[name="activation-credential-type"]')) {
    radio.addEventListener("change", syncCredentialFields);
  }

  activationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearStatus(activationStatus);

    if (
      state.operationInFlight ||
      !state.card ||
      !state.product ||
      state.blockedCards.has(state.card) ||
      Date.now() < state.cooldownUntil
    ) {
      setStatus(
        activationStatus,
        "error",
        "请重新查询卡密",
        "当前卡密状态已失效或需要人工核查。"
      );
      return;
    }

    if (!ownerConfirm.checked) {
      setStatus(
        activationStatus,
        "error",
        "需要账户确认",
        "请确认凭证属于你本人要充值的目标账户。"
      );
      ownerConfirm.focus();
      return;
    }

    const credentialType = selectedCredentialType();
    let payload;

    try {
      if (credentialType === "uid") {
        const uid = validateUid(uidInput.value);
        payload = { cdkey: state.card, uid };
      } else {
        const sessionInfo = parseSessionInfo(sessionInput.value, sessionFormat.value);
        payload = { cdkey: state.card, session_info: sessionInfo };
      }
    } catch (error) {
      setStatus(activationStatus, "error", "请检查账户信息", error.message);
      return;
    }

    state.pendingPayload = payload;
    finalConfirm.checked = false;
    dialogSubmit.disabled = true;
    renderDetails(dialogSummary, [
      ["产品", getProductLabel(state.product)],
      ["卡密", maskSensitive(state.card)],
      [
        "账户信息",
        credentialType === "uid" ? maskSensitive(payload.uid) : "Session / Token（不会显示）"
      ]
    ]);

    if (typeof dialog.showModal !== "function") {
      state.pendingPayload = null;
      setStatus(
        activationStatus,
        "error",
        "浏览器版本不受支持",
        "请升级 Safari、Chrome、Edge 或 Firefox 后再进行激活。"
      );
      return;
    }

    dialog.showModal();
  });

  finalConfirm.addEventListener("change", () => {
    dialogSubmit.disabled = !finalConfirm.checked;
  });

  dialogCancel.addEventListener("click", () => {
    state.pendingPayload = null;
    dialog.close();
  });

  dialog.addEventListener("close", () => {
    state.pendingPayload = null;
    finalConfirm.checked = false;
    dialogSubmit.disabled = true;
  });

  dialogSubmit.addEventListener("click", async () => {
    if (
      state.operationInFlight ||
      !state.pendingPayload ||
      !finalConfirm.checked
    ) {
      return;
    }

    const payload = state.pendingPayload;
    const operationCard = payload.cdkey;
    const operationEpoch = state.epoch;
    state.pendingPayload = null;
    state.operationInFlight = true;
    dialog.close();
    setFormBusy(checkForm, true, "激活处理中…");
    setFormBusy(activationForm, true, "正在激活…");
    setStatus(
      activationStatus,
      "info",
      "正在激活",
      "请保持页面打开；该操作不会自动重试。"
    );

    try {
      const result = await activateCard(payload);
      const ownsCurrentUi =
        state.epoch === operationEpoch && state.card === operationCard;

      if (result.success) {
        state.blockedCards.add(operationCard);
        if (ownsCurrentUi) {
          setStatus(
            activationStatus,
            "success",
            "激活完成",
            result.msg || "充值成功。"
          );
          cardInput.value = "";
          state.card = "";
          state.product = null;
          activationForm.hidden = true;
        }
        return;
      }

      const policy = applyOperationPolicy(result, operationCard);
      if (!ownsCurrentUi) {
        return;
      }
      const needsReview = policy.action === "lock";
      const coolingDown = policy.action === "cooldown";

      setStatus(
        activationStatus,
        needsReview || coolingDown ? "warning" : "error",
        needsReview
          ? "结果待核查"
          : coolingDown
            ? "已暂停重复提交"
            : "激活未完成",
        result.msg || result.code || "请根据提示检查后再操作。"
      );
    } catch (error) {
      const policy = applyOperationPolicy(error, operationCard);
      const ownsCurrentUi =
        state.epoch === operationEpoch && state.card === operationCard;
      if (!ownsCurrentUi) {
        return;
      }

      if (policy.action === "cooldown") {
        setStatus(
          activationStatus,
          "warning",
          "已暂停重复提交",
          error.message + " 请至少等待 60 秒。"
        );
      } else {
        showFieldError(activationStatus, error);
      }
    } finally {
      if (state.epoch === operationEpoch) {
        sessionInput.value = "";
        uidInput.value = "";
        ownerConfirm.checked = false;
      }
      state.operationInFlight = false;
      setFormBusy(checkForm, false);
      setFormBusy(activationForm, false);
      syncActivationGuard();
      syncCheckGuard();
    }
  });

  document.addEventListener("app:clear-sensitive", clearFlowState);
  syncCredentialFields();
  syncCheckGuard();
}
