export function normalizeOrderStatus(
  input: unknown
): "pending" | "paid" | "fulfilled" | "cancelled" | null;

export function normalizePaymentStatus(input: unknown): "paid" | "unpaid" | null;

export function normalizePrepStatus(input: unknown): "ready" | "not_ready" | null;

export function computeOrderStatusFromPayment(args: {
  existingStatus: unknown;
  paymentStatus: "paid" | "unpaid";
}): "pending" | "paid" | "fulfilled" | "cancelled";

export function computeBeforeIsoFromDateInput(dateStr: string): string | null;
