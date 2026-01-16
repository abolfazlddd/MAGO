"use client";

import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    setCart(loadCart());

    // Load products
    fetch("/api/products")
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

  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);

  function addToCart(productId: string) {
    const next = [...cart];
    const found = next.find((x) => x.productId === productId);
    if (found) found.qty += 1;
    else next.push({ productId, qty: 1 });
    setCart(next);
    saveCart(next);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>MAGO Charity Shop</h1>
        <a href="/cart" style={{ textDecoration: "underline" }}>
          Cart ({cartCount})
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
        Pickup only. Pay by e-transfer after placing your order.
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
          const out = trackStock && p.stock_on_hand <= 0;

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

              <p
  className={`mt-1 min-h-[22px] text-[color:var(--muted-foreground)] ${
    trackStock ? "visible" : "invisible"
  }`}
>
  Stock: {p.stock_on_hand}
</p>

              <button
                onClick={() => addToCart(p.id)}
                disabled={saleStatus === "closed" || out}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid transparent",
                  background: saleStatus === "closed" || out ? "#e5e7eb" : "#111827",
                  color: saleStatus === "closed" || out ? "#6b7280" : "#ffffff",
                  cursor: saleStatus === "closed" || out ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  boxShadow: saleStatus === "closed" || out ? "none" : "0 6px 18px rgba(17,24,39,0.18)",
                }}
              >
                {saleStatus === "closed" ? "Sale closed" : out ? "Out of stock" : "Add to cart"}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
