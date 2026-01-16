/**
 * Cart helpers shared between UI and tests.
 *
 * NOTE: This file is CommonJS so it can be tested with Node's built-in test runner
 * without adding extra tooling.
 */

/** @typedef {{ productId: string, qty: number }} CartItem */
/** @typedef {{ id: string, stock_on_hand?: number, track_stock?: boolean|null }} Product */

/**
 * @param {CartItem[]} cart
 * @param {string} productId
 */
function getQtyInCart(cart, productId) {
  const found = cart.find((x) => x.productId === productId);
  return found ? found.qty : 0;
}

/**
 * Treat null/undefined as "tracking is ON" (safe default).
 * @param {Product} product
 */
function isTrackingStock(product) {
  return product.track_stock !== false;
}

/**
 * @param {CartItem[]} cart
 * @param {Product} product
 */
function getMaxAddableQty(cart, product) {
  if (!isTrackingStock(product)) return Number.POSITIVE_INFINITY;

  const stock = Math.max(0, Number(product.stock_on_hand ?? 0));
  const inCart = getQtyInCart(cart, product.id);
  return Math.max(0, stock - inCart);
}

/**
 * Adds qtyToAdd of product to the cart, respecting stock tracking.
 * Returns { next, added } where added is how many were actually added.
 *
 * @param {CartItem[]} cart
 * @param {Product} product
 * @param {number} qtyToAdd
 */
function addToCart(cart, product, qtyToAdd) {
  const desired = Math.max(0, Math.floor(Number(qtyToAdd) || 0));
  if (desired <= 0) return { next: cart.slice(), added: 0 };

  const maxAddable = getMaxAddableQty(cart, product);
  const add = Math.min(desired, maxAddable);
  if (add <= 0) return { next: cart.slice(), added: 0 };

  const next = cart.map((x) => ({ ...x }));
  const found = next.find((x) => x.productId === product.id);
  if (found) found.qty += add;
  else next.push({ productId: product.id, qty: add });

  return { next, added: add };
}

/**
 * Sets cart quantity for a product (0 removes), respecting stock tracking.
 *
 * @param {CartItem[]} cart
 * @param {Product|undefined} product
 * @param {string} productId
 * @param {number} qty
 */
function setCartQty(cart, product, productId, qty) {
  let nextQty = Math.max(0, Math.floor(Number(qty) || 0));

  if (product && isTrackingStock(product)) {
    const max = Math.max(0, Number(product.stock_on_hand ?? 0));
    nextQty = Math.min(nextQty, max);
  }

  const next = cart
    .map((x) => (x.productId === productId ? { ...x, qty: nextQty } : x))
    .filter((x) => x.qty > 0);

  return next;
}

module.exports = {
  getQtyInCart,
  getMaxAddableQty,
  addToCart,
  setCartQty,
  // exported for parity/testing
  isTrackingStock,
};
