const test = require("node:test");
const assert = require("node:assert/strict");

const { addToCart, getMaxAddableQty, getQtyInCart, setCartQty } = require("../lib/cart");

test("addToCart adds multiple qty when stock is not tracked", () => {
  const p = { id: "p1", track_stock: false, stock_on_hand: 0 };
  const cart = [];
  const { next, added } = addToCart(cart, p, 3);
  assert.equal(added, 3);
  assert.equal(getQtyInCart(next, "p1"), 3);
});

test("addToCart clamps to remaining stock when tracked", () => {
  const p = { id: "p1", track_stock: true, stock_on_hand: 5 };
  const cart = [{ productId: "p1", qty: 4 }];
  assert.equal(getMaxAddableQty(cart, p), 1);
  const { next, added } = addToCart(cart, p, 10);
  assert.equal(added, 1);
  assert.equal(getQtyInCart(next, "p1"), 5);
});

test("addToCart returns added=0 when maxed", () => {
  const p = { id: "p1", track_stock: null, stock_on_hand: 2 };
  const cart = [{ productId: "p1", qty: 2 }];
  const { next, added } = addToCart(cart, p, 1);
  assert.equal(added, 0);
  assert.deepEqual(next, cart);
});

test("setCartQty clamps to stock and removes when set to 0", () => {
  const p = { id: "p1", track_stock: true, stock_on_hand: 2 };
  const cart = [{ productId: "p1", qty: 1 }];

  const clamped = setCartQty(cart, p, "p1", 99);
  assert.equal(getQtyInCart(clamped, "p1"), 2);

  const removed = setCartQty(clamped, p, "p1", 0);
  assert.equal(getQtyInCart(removed, "p1"), 0);
  assert.equal(removed.length, 0);
});
