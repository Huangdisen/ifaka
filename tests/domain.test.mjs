import test from "node:test";
import assert from "node:assert/strict";

import {
  getActivationBlockReason,
  getOperationRetryPolicy,
  getRefreshBlockReason,
  isClaudeProduct,
  maskSensitive,
  parseSessionInfo,
  validateBatchCards,
  validateCard,
  validateCheckData
} from "../assets/domain.js";

test("validateCard preserves case and rejects surrounding spaces", () => {
  assert.equal(validateCard("AbCdEf123"), "AbCdEf123");
  assert.throws(() => validateCard(" AbCdEf123"), /首尾/);
  assert.throws(() => validateCard("AbC\n123"), /换行/);
  assert.throws(() => validateCard(""), /请输入/);
});

test("maskSensitive never reveals a short value", () => {
  assert.equal(maskSensitive("ABC"), "••••");
  assert.equal(maskSensitive("ABCDEFGH"), "••••••••");
  assert.equal(maskSensitive("ABCDEFGHIJKL"), "ABCD••••••IJKL");
});

test("parseSessionInfo supports text and strict JSON objects", () => {
  assert.equal(parseSessionInfo("token", "text"), "token");
  assert.deepEqual(parseSessionInfo('{"accessToken":"token"}', "json"), {
    accessToken: "token"
  });
  assert.throws(() => parseSessionInfo("[]", "json"), /对象/);
  assert.throws(() => parseSessionInfo("{broken", "json"), /格式/);
});

test("validateBatchCards deduplicates exactly and keeps order", () => {
  assert.deepEqual(validateBatchCards("AbC\nabc\nAbC\nXYZ"), [
    "AbC",
    "abc",
    "XYZ"
  ]);
});

test("activation status blocks explicit unavailable states", () => {
  assert.match(getActivationBlockReason({ available: false }), /不允许/);
  assert.match(getActivationBlockReason({ status: "voided" }), /voided/);
  assert.equal(getActivationBlockReason({ available: true, status: "unused" }), "");
  assert.match(getActivationBlockReason({ status: "not_eligible" }), /not_eligible/);
  assert.match(
    getActivationBlockReason({ available: true, status: "suspended" }),
    /未识别/
  );
});

test("Claude refresh permits used cards but blocks terminal refresh states", () => {
  assert.equal(getRefreshBlockReason({ available: false, status: "used" }), "");
  assert.match(getRefreshBlockReason({ status: "voided" }), /voided/);
  assert.match(getRefreshBlockReason({ can_refresh: false }), /不可刷新/);
});

test("card checks fail closed on incomplete successful responses", () => {
  assert.throws(() => validateCheckData(null), /产品信息/);
  assert.throws(() => validateCheckData([]), /产品信息/);
  assert.throws(() => validateCheckData({ app: "gpt" }), /可用状态/);
  assert.deepEqual(
    validateCheckData({ app: "gpt", available: true }),
    { app: "gpt", available: true }
  );
});

test("consequential retry policy locks uncertainty and cools down rate limits", () => {
  assert.equal(
    getOperationRetryPolicy({ code: "upstream.uncertain" }).action,
    "lock"
  );
  assert.deepEqual(
    getOperationRetryPolicy({ httpStatus: 429 }),
    { action: "cooldown", delayMs: 60000 }
  );
  assert.equal(getOperationRetryPolicy({ code: "input.invalid" }).action, "allow");
});

test("Claude product recognition uses documented product fields", () => {
  assert.equal(isClaudeProduct({ app: "claude" }), true);
  assert.equal(isClaudeProduct({ product_name: "Anthropic Pro" }), true);
  assert.equal(isClaudeProduct({ app: "gpt" }), false);
});
