const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOrderStatus,
  normalizePaymentStatus,
  normalizePrepStatus,
  computeOrderStatusFromPayment,
  computeBeforeIsoFromDateInput,
} = require("../lib/orderAdmin");

test("normalizeOrderStatus maps unpaid -> pending and accepts valid statuses", () => {
  assert.equal(normalizeOrderStatus("unpaid"), "pending");
  assert.equal(normalizeOrderStatus(" PENDING "), "pending");
  assert.equal(normalizeOrderStatus("paid"), "paid");
  assert.equal(normalizeOrderStatus("fulfilled"), "fulfilled");
  assert.equal(normalizeOrderStatus("cancelled"), "cancelled");
});

test("normalizeOrderStatus rejects invalid values", () => {
  assert.equal(normalizeOrderStatus(""), null);
  assert.equal(normalizeOrderStatus("refunded"), null);
  assert.equal(normalizeOrderStatus(null), null);
});

test("normalizePaymentStatus accepts paid/unpaid", () => {
  assert.equal(normalizePaymentStatus("paid"), "paid");
  assert.equal(normalizePaymentStatus("unpaid"), "unpaid");
  assert.equal(normalizePaymentStatus("  UNPAID "), "unpaid");
  assert.equal(normalizePaymentStatus("pending"), null);
});

test("normalizePrepStatus accepts ready/not_ready", () => {
  assert.equal(normalizePrepStatus("ready"), "ready");
  assert.equal(normalizePrepStatus("not_ready"), "not_ready");
  assert.equal(normalizePrepStatus("not ready"), "not_ready");
  assert.equal(normalizePrepStatus("done"), null);
});

test("computeOrderStatusFromPayment respects terminal dominance", () => {
  assert.equal(computeOrderStatusFromPayment({ existingStatus: "fulfilled", paymentStatus: "unpaid" }), "fulfilled");
  assert.equal(computeOrderStatusFromPayment({ existingStatus: "cancelled", paymentStatus: "paid" }), "cancelled");
  assert.equal(computeOrderStatusFromPayment({ existingStatus: "pending", paymentStatus: "paid" }), "paid");
  assert.equal(computeOrderStatusFromPayment({ existingStatus: "paid", paymentStatus: "unpaid" }), "pending");
});

test("computeBeforeIsoFromDateInput returns ISO for YYYY-MM-DD and null for invalid", () => {
  const iso = computeBeforeIsoFromDateInput("2026-01-16");
  assert.ok(typeof iso === "string" && iso.includes("T"));
  assert.equal(computeBeforeIsoFromDateInput("not-a-date"), null);
});
