const test = require("node:test");
const assert = require("node:assert/strict");

const { filterOrders, ordersToCsv } = require("../lib/orderFilters");

test("filterOrders filters by status and search", () => {
  const orders = [
    {
      id: "o1",
      created_at: "2026-01-18T10:00:00.000Z",
      status: "paid",
      customer_name: "Alice",
      customer_phone: "111",
      customer_address: "123 Main",
      total_cents: 500,
      items: [{ product_name: "Socks", quantity: 1 }],
    },
    {
      id: "o2",
      created_at: "2026-01-17T10:00:00.000Z",
      status: "cancelled",
      customer_name: "Bob",
      customer_phone: "222",
      customer_address: "456 King",
      total_cents: 1000,
      items: [{ product_name: "Hat", quantity: 2 }],
    },
  ];

  assert.equal(filterOrders(orders, { status: "paid" }).length, 1);
  assert.equal(filterOrders(orders, { hideCancelled: true }).length, 1);
  assert.equal(filterOrders(orders, { q: "hat" })[0].id, "o2");
  assert.equal(filterOrders(orders, { q: "123 main" })[0].id, "o1");
});

test("filterOrders sorts totals", () => {
  const orders = [
    { id: "a", created_at: "2026-01-18T10:00:00.000Z", total_cents: 100 },
    { id: "b", created_at: "2026-01-18T11:00:00.000Z", total_cents: 200 },
  ];
  assert.deepEqual(filterOrders(orders, { sort: "total_desc" }).map((o) => o.id), ["b", "a"]);
  assert.deepEqual(filterOrders(orders, { sort: "total_asc" }).map((o) => o.id), ["a", "b"]);
});

test("ordersToCsv emits header + rows and escapes commas/quotes", () => {
  const csv = ordersToCsv([
    {
      id: "o1",
      created_at: "2026-01-18T10:00:00.000Z",
      status: "paid",
      customer_name: 'Alice "A"',
      customer_phone: "111",
      customer_address: "123 Main, Toronto",
      total_cents: 500,
      items: [{ product_name: "Socks", quantity: 1 }],
      notes: "please call",
      admin_note: "",
    },
  ]);

  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("customer_address"));
  assert.ok(lines[1].includes('"123 Main, Toronto"'));
  assert.ok(lines[1].includes('"Alice ""A"""'));
});
