/**
 * Admin-side helpers for viewing/managing orders.
 * NOTE: UI-only logic; DB is source of truth.
 */

function normalizeStr(v) {
  return String(v ?? "").trim().toLowerCase();
}

function safeIncludes(haystack, needle) {
  if (!needle) return true;
  return normalizeStr(haystack).includes(needle);
}

function toTimeMs(isoOrDateStr) {
  if (!isoOrDateStr) return null;
  const d = new Date(String(isoOrDateStr));
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[\n\r\t",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {Array<any>} orders
 * @param {{
 *  status?: string,
 *  q?: string,
 *  createdFrom?: string,
 *  createdTo?: string,
 *  hideCancelled?: boolean,
 *  sort?: "newest"|"oldest"|"total_desc"|"total_asc"
 * }} opts
 */
function filterOrders(orders, opts) {
  const list = Array.isArray(orders) ? orders : [];
  const status = normalizeStr(opts?.status || "");
  const q = normalizeStr(opts?.q || "");
  const hideCancelled = !!opts?.hideCancelled;
  const fromMs = toTimeMs(opts?.createdFrom);
  const toMs = toTimeMs(opts?.createdTo);

  const filtered = list.filter((o) => {
    const oStatus = normalizeStr(o?.status);
    if (hideCancelled && oStatus === "cancelled") return false;
    if (status && status !== "all" && oStatus !== status) return false;

    const createdMs = toTimeMs(o?.created_at);
    if (fromMs != null && createdMs != null && createdMs < fromMs) return false;
    if (toMs != null && createdMs != null && createdMs > toMs) return false;

    if (!q) return true;

    const hay = [
      o?.id,
      o?.customer_name,
      o?.customer_phone,
      o?.customer_address,
      o?.notes,
      o?.admin_note,
      o?.status,
    ].join(" | ");

    if (safeIncludes(hay, q)) return true;

    const items = Array.isArray(o?.items) ? o.items : [];
    return items.some((it) => safeIncludes(it?.product_name || it?.product_id, q));
  });

  const sort = opts?.sort || "newest";
  const cmp = {
    newest: (a, b) => (toTimeMs(b?.created_at) ?? 0) - (toTimeMs(a?.created_at) ?? 0),
    oldest: (a, b) => (toTimeMs(a?.created_at) ?? 0) - (toTimeMs(b?.created_at) ?? 0),
    total_desc: (a, b) => Number(b?.total_cents ?? 0) - Number(a?.total_cents ?? 0),
    total_asc: (a, b) => Number(a?.total_cents ?? 0) - Number(b?.total_cents ?? 0),
  }[sort];

  return cmp ? filtered.slice().sort(cmp) : filtered;
}

/**
 * Flatten orders into CSV for quick exports.
 * @param {Array<any>} orders
 */
function ordersToCsv(orders) {
  const rows = [];
  rows.push([
    "id",
    "created_at",
    "status",
    "customer_name",
    "customer_phone",
    "customer_address",
    "total_cents",
    "items",
    "customer_notes",
    "admin_note",
  ]);

  for (const o of Array.isArray(orders) ? orders : []) {
    const items = Array.isArray(o?.items) ? o.items : [];
    const itemsText = items
      .map((it) => `${it?.product_name || it?.product_id || "Item"} x${it?.quantity || 0}`)
      .join("; ");

    rows.push([
      o?.id,
      o?.created_at,
      o?.status,
      o?.customer_name,
      o?.customer_phone,
      o?.customer_address,
      o?.total_cents,
      itemsText,
      o?.notes || "",
      o?.admin_note || "",
    ]);
  }

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

module.exports = {
  filterOrders,
  ordersToCsv,
};
