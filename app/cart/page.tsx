"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price_cents: number;
  stock_on_hand: number;
  track_stock: boolean | null;
};

type CartItem = { productId: string; qty: number };

const CART_KEY = "mago_cart";
const RES_TOKEN_KEY = "mago_reservation_token";
const ACTIVE_RES_ID_KEY = "mago_active_reservation_id";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function loadCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function ensureReservationToken() {
  const existing = localStorage.getItem(RES_TOKEN_KEY);
  if (existing && existing.trim()) return existing.trim();
  const token = crypto.randomUUID();
  localStorage.setItem(RES_TOKEN_KEY, token);
  return token;
}

export default function CartPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // ✅ If user left checkout with a hold, cancel it when they return to cart
  useEffect(() => {
    const rid = localStorage.getItem(ACTIVE_RES_ID_KEY) || "";
    if (!rid) return;

    const token = ensureReservationToken();
    fetch("/api/reservations/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservationId: rid, token }),
    }).finally(() => {
      localStorage.removeItem(ACTIVE_RES_ID_KEY);
    });
  }, []);

  useEffect(() => {
    setCart(loadCart());
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProducts((d.products || []) as Product[]));
  }, []);

  const rows = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));

    return cart
      .map((ci) => {
        const p = byId.get(ci.productId);
        if (!p) return null;

        return {
          productId: ci.productId,
          qty: ci.qty,
          id: p.id,
          name: p.name,
          price_cents: p.price_cents,
          stock_on_hand: p.stock_on_hand,
          track_stock: p.track_stock,
        };
      })
      .filter(Boolean) as Array<CartItem & Product>;
  }, [cart, products]);

  const subtotal = useMemo(() => rows.reduce((sum, r) => sum + r.price_cents * r.qty, 0), [rows]);

  function setQty(productId: string, qty: number) {
    let nextQty = qty;

    // Do NOT clamp to stock automatically (stock can be 0 due to holds)
    if (!Number.isFinite(nextQty)) nextQty = 0;
    if (nextQty < 0) nextQty = 0;

    const next = cart
      .map((x) => (x.productId === productId ? { ...x, qty: nextQty } : x))
      .filter((x) => x.qty > 0);

    setCart(next);
    saveCart(next);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Your Cart</h1>
        <a href="/" style={{ textDecoration: "underline" }}>
          Back to shop
        </a>
      </header>

      {rows.length === 0 ? (
        <p style={{ marginTop: 16 }}>Cart is empty.</p>
      ) : (
        <>
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {rows.map((r) => {
              const tracking = r.track_stock !== false;
              const availableNow = tracking ? Math.max(0, r.stock_on_hand ?? 0) : Infinity;
              const canIncrease = !tracking || r.qty < availableNow;
              const exceedsAvailable = tracking && r.qty > availableNow;

              return (
                <div
                  key={r.productId}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.name}</div>
                    <div style={{ color: "var(--muted-foreground)" }}>{formatMoney(r.price_cents)}</div>

                    {tracking ? (
                      <div style={{ color: "var(--muted-foreground)" }}>Stock available now: {availableNow}</div>
                    ) : (
                      <div style={{ color: "var(--muted-foreground)" }}>Stock not tracked</div>
                    )}

                    {exceedsAvailable ? (
                      <div style={{ marginTop: 6, color: "var(--danger)" }}>
                        This item is currently out of stock (or reserved in checkout). You may need to reduce quantity
                        before checkout.
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setQty(r.productId, r.qty - 1)} style={{ padding: "6px 10px" }}>
                      -
                    </button>

                    <div style={{ minWidth: 24, textAlign: "center" }}>{r.qty}</div>

                    <button
                      onClick={() => setQty(r.productId, r.qty + 1)}
                      style={{ padding: "6px 10px" }}
                      disabled={!canIncrease}
                      title={!canIncrease ? "No more stock available right now" : "Increase quantity"}
                    >
                      +
                    </button>

                    <button onClick={() => setQty(r.productId, 0)} style={{ padding: "6px 10px" }}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, fontWeight: 800 }}>Subtotal: {formatMoney(subtotal)}</div>

          <a
            href="/checkout"
            className="inline-block mt-3 rounded-xl border-2 px-4 py-3 font-extrabold transition
                       bg-slate-900 text-white border-slate-300 hover:bg-slate-800
                       dark:bg-slate-950 dark:text-white dark:border-slate-200 dark:hover:bg-slate-900"
          >
            Continue to checkout
          </a>
        </>
      )}
    </main>
  );
}
