function buildPackingSlipHtml(input) {
  const orders = Array.isArray(input) ? input : [input];

  const slips = orders.map((order) => renderOneOrderSlip(normalizeOrder(order))).join("\n<div class='page-break'></div>\n");

  // If we somehow still built nothing, return a visible error page instead of blank
  const body = slips.trim()
    ? slips
    : `<div style="font-family: system-ui; padding: 24px;">
         <h1>Packing slip is empty</h1>
         <p>The order data passed to the packing slip renderer did not contain expected fields.</p>
       </div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Packing Slips</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
    h1,h2,h3 { margin: 0 0 8px 0; }
    .muted { opacity: 0.75; }
    .row { display: flex; gap: 24px; }
    .col { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; vertical-align: top; }
    .right { text-align: right; }
    .page-break { page-break-after: always; }
    @media print {
      body { margin: 0.5in; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function normalizeOrder(order) {
  const o = order || {};

  // Support BOTH shapes:
  // 1) UI/Admin uses: order.items[{ quantity, price_cents, product_name }]
  // 2) Some APIs use: order.order_items[{ qty, unit_price_cents, product_name }]
  const rawItems =
    Array.isArray(o.items) ? o.items :
    Array.isArray(o.order_items) ? o.order_items :
    [];

  const items = rawItems.map((it) => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unit = Number(it.price_cents ?? it.unit_price_cents ?? 0);
    const name = String(it.product_name ?? it.name ?? it.product?.name ?? "Item");

    return { qty, unit_price_cents: unit, product_name: name };
  });

  const subtotal =
    Number.isFinite(Number(o.total_cents)) ? Number(o.total_cents) :
    Number.isFinite(Number(o.subtotal_cents)) ? Number(o.subtotal_cents) :
    items.reduce((sum, it) => sum + it.qty * it.unit_price_cents, 0);

  return {
    id: o.id ?? "",
    created_at: o.created_at ?? "",
    customer_name: o.customer_name ?? "",
    customer_phone: o.customer_phone ?? "",
    customer_address: o.customer_address ?? "",
    notes: o.notes ?? "",
    admin_note: o.admin_note ?? "",
    payment_status: o.payment_status ?? "",
    prep_status: o.prep_status ?? "",
    status: o.status ?? "",
    subtotal_cents: subtotal,
    items,
  };
}

function renderOneOrderSlip(order) {
  const subtotal = centsToMoney(order.subtotal_cents);

  const itemsRows = order.items.length
    ? order.items.map((it) => {
        const lineTotal = centsToMoney(it.qty * it.unit_price_cents);
        return `<tr>
          <td>${escapeHtml(it.product_name)}</td>
          <td class="right">${it.qty}</td>
          <td class="right">${centsToMoney(it.unit_price_cents)}</td>
          <td class="right">${lineTotal}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="muted">No items found on this order.</td></tr>`;

  return `<section>
    <h2>Packing Slip</h2>
    <div class="muted">Order: ${escapeHtml(String(order.id))}</div>
    <div class="muted">Created: ${escapeHtml(String(order.created_at))}</div>

    <div style="height: 12px;"></div>

    <div class="row">
      <div class="col">
        <h3>Customer</h3>
        <div>${escapeHtml(order.customer_name)}</div>
        <div>${escapeHtml(order.customer_phone)}</div>
        <div style="white-space: pre-wrap;">${escapeHtml(order.customer_address)}</div>
      </div>
      <div class="col">
        <h3>Status</h3>
        <div>Payment: ${escapeHtml(String(order.payment_status || "unpaid"))}</div>
        <div>Prep: ${escapeHtml(String(order.prep_status || "not_ready"))}</div>
        <div>Terminal: ${escapeHtml(String(order.status || "open"))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Qty</th>
          <th class="right">Unit</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="right"><strong>Subtotal</strong></td>
          <td class="right"><strong>${subtotal}</strong></td>
        </tr>
      </tfoot>
    </table>

    ${order.notes ? `<div style="margin-top: 12px;"><strong>Customer notes:</strong><div style="white-space: pre-wrap;">${escapeHtml(order.notes)}</div></div>` : ""}
    ${order.admin_note ? `<div style="margin-top: 12px;"><strong>Admin notes:</strong><div style="white-space: pre-wrap;">${escapeHtml(order.admin_note)}</div></div>` : ""}
  </section>`;
}

function centsToMoney(cents) {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
module.exports = { buildPackingSlipHtml };