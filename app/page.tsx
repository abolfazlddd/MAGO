"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addToCart as addToCartWithQty, getMaxAddableQty, getQtyInCart } from "@/lib/cart";
import NextImage from "next/image";
import { countCartItems } from "@/lib/cartCount";

type Product = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  stock_on_hand: number;
  track_stock: boolean | null;
  image_url: string | null;
};

type CartItem = { productId: string; qty: number };

const CART_KEY = "mago_cart";

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

export default function Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleStatus, setSaleStatus] = useState<"open" | "closed">("open");

  // Per-product UI state
  const [qtyToAdd, setQtyToAdd] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, "idle" | "added" | "maxed">>({});
  // Track timers per product so we can clear/reset them cleanly
const feedbackTimers = useRef<Record<string, number>>({});
useEffect(() => {
  return () => {
    // clear any outstanding timers on unmount
    Object.values(feedbackTimers.current).forEach((id) => {
      clearTimeout(id);
    });
    feedbackTimers.current = {};
  };
}, []);

  useEffect(() => {
    setCart(loadCart());

    // Load products
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));

    // Function to load sale status
    const loadStatus = () => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => setSaleStatus(d.sale_status === "closed" ? "closed" : "open"))
        .catch(() => setSaleStatus("open")); // fail open
    };

    loadStatus();

    // Poll every 10s so page updates without reload
    const t = setInterval(loadStatus, 10000);
    return () => clearInterval(t);
  }, []);

  const cartCount = useMemo(() => countCartItems(cart), [cart]);

  function bumpQty(productId: string, delta: number, max: number) {
    setQtyToAdd((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [productId]: next };
    });

    // Longer-lived button state:
    // keep "Added ✓" until the user changes the selector
    setFeedback((prev) => ({ ...prev, [productId]: "idle" }));
  }

  function addProductToCart(product: Product) {
  const desired = qtyToAdd[product.id] ?? 1;
  const { next, added } = addToCartWithQty(cart, product, desired);

  if (added > 0) {
    setCart(next);
    saveCart(next);

    // Set the "added" feedback
    setFeedback((prev) => ({ ...prev, [product.id]: "added" }));

    // Clear any existing timer for this product
    const existing = feedbackTimers.current[product.id];
    if (existing) {
      clearTimeout(existing);
    }

    // After a short delay, revert feedback back to "idle"
    const timerId = window.setTimeout(() => {
      setFeedback((prev) => {
        // guard: only reset if still currently "added"
        if (prev[product.id] === "added") {
          return { ...prev, [product.id]: "idle" };
        }
        return prev;
      });
      delete feedbackTimers.current[product.id];
    }, 3500); // 3.5s confirmation

    feedbackTimers.current[product.id] = timerId;
  } else {
    // User asked to add, but we couldn't add anything (usually stock maxed)
    setFeedback((prev) => ({ ...prev, [product.id]: "maxed" }));
  }
}

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
  <NextImage
  src="/mago-logo.png"
  alt="MAGO"
  width={60}
  height={60}
  priority
  style={{ borderRadius: 10, objectFit: "contain" }}
/>
  <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>MAGO Mehr Kitchen</h1>
</div>
<a
onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.25)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.18)";
}}
onMouseDown={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.22)";
}}
onMouseUp={(e) => {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.25)";
}}
  href="/cart"
  aria-label={cartCount > 0 ? `Open cart (${cartCount} items)` : "Open cart"}
  style={{
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 50,

    // original cart button styling (unchanged)
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--background)",
    textDecoration: "none",
    color: "inherit",
    fontWeight: 900,

    // extra: subtle lift so it feels tappable + separated from content
    boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
transition: "transform 140ms ease, box-shadow 140ms ease",
willChange: "transform",

    // extra: avoid iOS home indicator overlap
    marginBottom: "env(safe-area-inset-bottom)",
  }}
>
  <span
    style={{
      width: 40,
      height:48,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      overflow: "hidden",
      background: "rgba(0,0,0,0.03)",
      border: "1px solid rgba(0,0,0,0.08)",
      flex: "0 0 auto",
    }}
  >
    <img src="/cart-icon.png" alt="" style={{ width: 32, height: 32 }} />
  </span>

  <span style={{ lineHeight: 1 }}>Cart</span>

  {cartCount > 0 ? (
    <span
      aria-label={`Cart items: ${cartCount}`}
      style={{
        marginLeft: 2,
        minWidth: 22,
        height: 22,
        padding: "0 7px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111827",
        color: "white",
        fontSize: 14,
        fontWeight: 900,
      }}
    >
      {cartCount}
    </span>
  ) : null}
</a>
      </header>

      {saleStatus === "closed" && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
          }}
        >
          <b>Ordering is currently closed.</b> Please check back during the next sale.
        </div>
      )}

      <p style={{ marginTop: 8, color: "var(--muted-foreground)" }}>
        Please pay by e-transfer before placing your order. Instructions on the checkout page.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {products.map((p) => {
          // Treat null/undefined as "tracking is ON" (safe default)
          const trackStock = p.track_stock !== false;
          const inCart = getQtyInCart(cart, p.id);
          const maxAddable = getMaxAddableQty(cart, p);
          const out = trackStock && maxAddable <= 0;

          // UX: only show qty selector when user can actually add items.
          // - If the sale is closed, hide it.
          // - If the item is out of stock (when stock is tracked), hide it.
          const canSelectQty = saleStatus === "open" && !out;

          const selectorMax = Number.isFinite(maxAddable) ? Math.max(1, maxAddable) : 99;
          const selectedQtyRaw = qtyToAdd[p.id] ?? 1;
          const selectedQty = Math.max(1, Math.min(selectorMax, selectedQtyRaw));
          const status = feedback[p.id] ?? "idle";
          const baseLabel = saleStatus === "closed" ? "Sale closed" : out ? "Out of stock" : "Add to cart";
          const label =
            saleStatus === "closed" || out
              ? baseLabel
              : status === "added"
                ? "Added to cart ✓"
                : status === "maxed"
                  ? "No stock left"
                  : baseLabel;

          return (
            <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10 }}
                />
              ) : (
                <div style={{ width: "100%", height: 160, background: "var(--card-2)", borderRadius: 10 }} />
              )}

              <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>{p.name}</h2>
              <p style={{ color: "var(--muted-foreground)", marginTop: 4 }}>{p.description}</p>
              <p style={{ marginTop: 8, fontWeight: 700 }}>{formatMoney(p.price_cents)}</p>

              <p className="mt-1 min-h-[22px] text-[color:var(--muted-foreground)]">
                {trackStock ? `Stock: ${p.stock_on_hand} • ` : ""}
                In cart: {inCart}
              </p>

              {canSelectQty && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpQty(p.id, -1, selectorMax)}
                    disabled={selectedQty <= 1}
                    className="h-10 w-10 rounded-xl border font-extrabold transition disabled:opacity-40"
                    aria-label={`Decrease ${p.name} quantity`}
                  >
                    −
                  </button>

                  <div className="h-10 flex-1 rounded-xl border px-3 flex items-center justify-center font-extrabold">
                    {selectedQty}
                  </div>

                  <button
                    type="button"
                    onClick={() => bumpQty(p.id, +1, selectorMax)}
                    disabled={trackStock && selectedQty >= selectorMax}
                    className="h-10 w-10 rounded-xl border font-extrabold transition disabled:opacity-40"
                    aria-label={`Increase ${p.name} quantity`}
                  >
                    +
                  </button>
                </div>
              )}

              <button
                onClick={() => addProductToCart(p)}
                disabled={saleStatus === "closed" || out}
                className={`mt-2 w-full rounded-xl px-4 py-3 font-extrabold transition-all duration-150 border
                  ${
                    saleStatus === "closed" || out
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed border-transparent"
                      : "bg-slate-900 text-white border-slate-300 shadow-lg hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                  }`}
              >
                {label}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
