function countCartItems(cart) {
  if (!Array.isArray(cart)) return 0;
  let sum = 0;
  for (const item of cart) {
    const qty = Number(item?.qty ?? 0);
    if (Number.isFinite(qty) && qty > 0) sum += qty;
  }
  return sum;
}

module.exports = { countCartItems };
