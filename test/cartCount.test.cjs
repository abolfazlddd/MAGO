const { test } = require("node:test");
const assert = require("node:assert/strict");

const { countCartItems } = require("../lib/cartCount");

test("countCartItems sums qty", () => {
  assert.equal(countCartItems([{ productId: "a", qty: 2 }, { productId: "b", qty: 3 }]), 5);
});

test("countCartItems handles bad input safely", () => {
  assert.equal(countCartItems(null), 0);
  assert.equal(countCartItems([{ qty: "2" }, { qty: -1 }, { qty: NaN }]), 2);
});
