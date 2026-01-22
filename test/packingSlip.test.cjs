const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildPackingSlipHtml } = require("../lib/packingSlip");

test("packing slip renders with items[] shape", () => {
  const html = buildPackingSlipHtml([{
    id: "o1",
    created_at: "2026-01-18",
    customer_name: "A",
    customer_phone: "B",
    customer_address: "C",
    total_cents: 1200,
    items: [{ quantity: 2, price_cents: 600, product_name: "Hat" }],
  }]);

  assert.ok(html.includes("Packing Slip"));
  assert.ok(html.includes("Hat"));
  assert.ok(html.length > 500);
});

test("packing slip does not blank when items missing", () => {
  const html = buildPackingSlipHtml([{ id: "o2" }]);

  assert.ok(html.includes("Packing Slip"));
  assert.ok(html.includes("No items found"));
});
