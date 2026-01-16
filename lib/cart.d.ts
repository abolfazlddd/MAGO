export type CartItem = { productId: string; qty: number };

export type ProductStock = {
  id: string;
  stock_on_hand?: number;
  track_stock?: boolean | null;
};

export function getQtyInCart(cart: CartItem[], productId: string): number;

/**
 * Returns Infinity when stock is NOT tracked.
 * When stock is tracked, returns max quantity that can still be added given current cart.
 */
export function getMaxAddableQty(cart: CartItem[], product: ProductStock): number;

export function addToCart(
  cart: CartItem[],
  product: ProductStock,
  qtyToAdd: number
): { next: CartItem[]; added: number };

export function setCartQty(
  cart: CartItem[],
  product: ProductStock | undefined,
  productId: string,
  qty: number
): CartItem[];
