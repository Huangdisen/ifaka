export function setStatus(element, tone, title, detail = "") {
  element.replaceChildren();
  element.className = "status-message status-" + tone;

  const heading = document.createElement("strong");
  heading.textContent = title;
  element.append(heading);

  if (detail) {
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    element.append(paragraph);
  }

  element.hidden = false;
}

const submitButtonContents = new WeakMap();

export function clearStatus(element) {
  element.replaceChildren();
  element.hidden = true;
  element.className = "status-message";
}

export function renderDetails(container, entries) {
  const list = document.createElement("dl");
  list.className = "result-list";

  for (const [label, value] of entries) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value || "—";
    list.append(term, description);
  }

  container.replaceChildren(list);
}

export function setFormBusy(form, busy, busyText = "处理中…") {
  form.setAttribute("aria-busy", String(busy));
  const submit = form.querySelector('button[type="submit"]');

  if (!submit) {
    return;
  }

  if (busy) {
    if (!submitButtonContents.has(submit)) {
      submitButtonContents.set(submit, [...submit.childNodes]);
    }
    submit.replaceChildren(busyText);
    submit.disabled = true;
  } else {
    const originalContents = submitButtonContents.get(submit);
    if (originalContents) {
      submit.replaceChildren(...originalContents);
      submitButtonContents.delete(submit);
    }
    submit.disabled = false;
  }

  for (const control of form.querySelectorAll("input, textarea, select, button")) {
    if (control !== submit) {
      control.disabled = busy;
    }
  }
}

export function clearSensitiveFields(root = document) {
  for (const field of root.querySelectorAll("[data-sensitive]")) {
    field.value = "";
  }

  for (const button of root.querySelectorAll("[data-toggle-secret]")) {
    const input = document.getElementById(button.dataset.toggleSecret);
    if (input?.type === "text") {
      input.type = "password";
    }
    button.textContent = "显示";
    button.setAttribute("aria-pressed", "false");
  }
}

export function showFieldError(statusElement, error) {
  setStatus(
    statusElement,
    error?.uncertain ? "warning" : "error",
    error?.uncertain ? "结果待核查" : "操作未完成",
    error?.message || "发生未知错误，请稍后手动重试。"
  );
}

export function setupSecretToggles() {
  for (const button of document.querySelectorAll("[data-toggle-secret]")) {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.toggleSecret);
      if (!input) {
        return;
      }

      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "隐藏" : "显示";
      button.setAttribute("aria-pressed", String(reveal));
    });
  }
}
