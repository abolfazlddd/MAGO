"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; price_cents: number };
type CartItem = { productId: string; qty: number };

const CART_KEY = "mago_cart";
const CUSTOMER_KEY = "mago_customer";

function loadCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function loadCustomer() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null"); } catch { return null; }
}
function saveCustomer(c: any) {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
}
function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CheckoutPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [remember, setRemember] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [saleStatus, setSaleStatus] = useState<"open" | "closed">("open");

  useEffect(() => {
    setCart(loadCart());
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));
      fetch("/api/settings")
  .then((r) => r.json())
  .then((d) => setSaleStatus(d.sale_status === "closed" ? "closed" : "open"));

    const saved = loadCustomer();
    if (saved) {
      setName(saved.name || "");
      setPhone(saved.phone || "");
      setAddress(saved.address || "");
    }
  }, []);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, ci) => {
      const p = products.find((x) => x.id === ci.productId);
      if (!p) return sum;
      return sum + p.price_cents * ci.qty;
    }, 0);
  }, [cart, products]);

  async function placeOrder() {
        // Re-check status right before ordering (prevents stale state)
    const s = await fetch("/api/settings").then((r) => r.json());
    if (s.sale_status === "closed") {
      setError("Ordering is currently closed.");
      return;
    }
    setError("");
    setResult(null);
      if (saleStatus === "closed") {
    setError("Ordering is currently closed.");
    return;
  }


    if (!name || !phone || !address) {
      setError("Please fill name, phone, and address.");
      return;
    }
    if (cart.length === 0) {
      setError("Cart is empty.");
      return;
    }

    if (remember) saveCustomer({ name, phone, address });

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer: { name, phone, address, notes },
        items: cart,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Order failed.");
      return;
    }

    // clear cart on success
    saveCart([]);
    setCart([]);
    setResult(data);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Checkout</h1>
        <a href="/cart" style={{ textDecoration: "underline" }}>Back to cart</a>
      </header>

      <p style={{ marginTop: 8 }}>Pickup only. After placing your order, you’ll pay by e-transfer.</p>

      <div style={{ marginTop: 14, fontWeight: 800 }}>Subtotal: {formatMoney(subtotal)}</div>

      <div style={{ marginTop: 16, display: "grid", gap: 10, maxWidth: 520 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }} />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }} />
        </label>
        <label>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }} />
        </label>
        <label>
          Notes (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }} />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember my info on this device
        </label>

        <button
  onClick={placeOrder}
  disabled={saleStatus === "closed"}
  className="w-full rounded-xl border px-4 py-3 font-extrabold transition
             disabled:cursor-not-allowed disabled:opacity-60
             border-green-700 bg-green-600 text-white hover:bg-green-700
             dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
>
  {saleStatus === "closed" ? "Ordering closed" : "Place order"}
</button>
<section className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4
                    dark:border-slate-700 dark:bg-slate-900/60">
  <div className="mb-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
    Payment: e-Transfer
  </div>

  <div className="leading-relaxed text-slate-700 dark:text-slate-200">
    After you place your order, please send an e-Transfer to:{" "}
    <span className="font-extrabold text-slate-900 dark:text-white">
      YOUR_EMAIL_HERE
    </span>
    <br />
    <br />
    <span className="font-extrabold text-slate-900 dark:text-white">Important:</span>{" "}
    In the e-Transfer note/message, include your{" "}
    <span className="font-extrabold text-slate-900 dark:text-white">name</span>{" "}
    and/or your{" "}
    <span className="font-extrabold text-slate-900 dark:text-white">Order ID</span>.
    <br />
    This helps us match your payment to your order quickly.
  </div>
</section>

        {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}

        {result ? (
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900 }}>Order placed!</div>
            <div style={{ marginTop: 6 }}>Order ID: <code>{result.publicOrderId}</code></div>
            <div style={{ marginTop: 10, fontWeight: 800 }}>Send e-transfer to:</div>
            <div>{result.etransfer?.name}</div>
            <div><code>{result.etransfer?.email}</code></div>
            <div style={{ marginTop: 10 }}>{result.etransfer?.message}</div>
            <div style={{ marginTop: 10 }}>
              <a href="/" style={{ textDecoration: "underline" }}>Back to shop</a>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
