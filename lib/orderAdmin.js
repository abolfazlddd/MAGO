function normalizeOrderStatus(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === "unpaid") return "pending";
  if (["pending", "paid", "fulfilled", "cancelled"].includes(s)) return s;
  return null;
}

function normalizePaymentStatus(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === "unpaid") return "unpaid";
  if (s === "paid") return "paid";
  return null;
}

function normalizePrepStatus(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === "ready") return "ready";
  if (s === "not_ready" || s === "not ready" || s === "not-ready") return "not_ready";
  return null;
}

/**
 * Backwards-compatible state model:
 * - `status` is the DB enum: pending | paid | fulfilled | cancelled
 * - `payment_status` (new) is: unpaid | paid
 * - `prep_status` (new) is: not_ready | ready
 *
 * Dominant rule:
 * - If terminal status is fulfilled/cancelled => it wins.
 * - Otherwise status mirrors payment_status (paid => paid, else pending).
 */
function computeOrderStatusFromPayment({ existingStatus, paymentStatus }) {
  const terminal = String(existingStatus || "").toLowerCase();
  if (terminal === "fulfilled" || terminal === "cancelled") return terminal;
  if (paymentStatus === "paid") return "paid";
  return "pending";
}

function computeBeforeIsoFromDateInput(dateStr) {
  // Local midnight (important: no trailing Z)
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

module.exports = {
  normalizeOrderStatus,
  normalizePaymentStatus,
  normalizePrepStatus,
  computeOrderStatusFromPayment,
  computeBeforeIsoFromDateInput,
};
