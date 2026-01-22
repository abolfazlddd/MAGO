"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatAddress, isValidCanadianPostal, normalizeCanadianPostal } from "@/lib/address";
import { successStyles } from "@/lib/checkoutSuccessStyles";
import { HOLD_MINUTES } from "@/lib/hold";


type Product = { id: string; name: string; price_cents: number };
type CartItem = { productId: string; qty: number };

const CART_KEY = "mago_cart";
const CUSTOMER_KEY = "mago_customer";
const RES_TOKEN_KEY = "mago_reservation_token";
const ACTIVE_RES_ID_KEY = "mago_active_reservation_id";


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
function loadCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null");
  } catch {
    return null;
  }
}
function saveCustomer(c: any) {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
}
function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function ensureReservationToken() {
  const existing = localStorage.getItem(RES_TOKEN_KEY);
  if (existing && existing.trim()) return existing.trim();
  const token = crypto.randomUUID();
  localStorage.setItem(RES_TOKEN_KEY, token);
  return token;
}

function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CheckoutPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [remember, setRemember] = useState(true);
   const [holdMinutes, setHoldMinutes] = useState(HOLD_MINUTES);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [unit, setUnit] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");

  const [notes, setNotes] = useState("");
  const [customerConfirmedEtransfer, setCustomerConfirmedEtransfer] = useState(false);

const [result, setResult] = useState<any>(null);
const [error, setError] = useState<string>("");

const errorRef = useRef<HTMLDivElement | null>(null);
// Reservation / hold state (you were missing these)
const [reservationId, setReservationId] = useState<string>("");
const [expiresAt, setExpiresAt] = useState<string>("");
const [secondsLeft, setSecondsLeft] = useState<number>(0);
const [reserving, setReserving] = useState<boolean>(true);

// Countdown interval ref (you were missing this too)
const timerRef = useRef<number | null>(null);

useEffect(() => {
  if (result) {
    // Success: scroll to bottom (order placed panel)
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    });
    return;
  }

  if (error) {
    // Error: scroll to the error message so user actually sees it
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }
}, [result, error]);

  useEffect(() => {
  setCart(loadCart());

  // Load products
  fetch("/api/products", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => setProducts(d.products || []));

  // Load saved customer (simple shape)
  const saved = loadCustomer();
  if (saved) {
    setName(saved.name || "");
    setPhone(saved.phone || "");
    setStreet(saved.street || "");
    setUnit(saved.unit || "");
    setCity(saved.city || "");
    setPostal(saved.postal || "");
  }
}, []);
const subtotal = useMemo(() => {
  return cart.reduce((sum, ci) => {
    const p = products.find((x) => x.id === ci.productId);
    if (!p) return sum;
    return sum + p.price_cents * ci.qty;
  }, 0);
}, [cart, products]);
  async function cancelHoldBestEffort(resId?: string) {
    try {
      const token = ensureReservationToken();
      const rid = (resId ?? reservationId) || localStorage.getItem(ACTIVE_RES_ID_KEY) || "";
      if (!rid) return;

      await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reservationId: rid, token }),
        // keepalive helps with unload/pagehide
        keepalive: true as any,
      });

      localStorage.removeItem(ACTIVE_RES_ID_KEY);
    } catch {
      // best-effort; ignore
    }
  }

  // ✅ Cancel hold when user leaves checkout via back/refresh/close
  useEffect(() => {
    const onPageHide = () => {
      // fire-and-forget
      cancelHoldBestEffort();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  // Create reservation when cart loads (idempotent on server now)
  useEffect(() => {
    if (cart.length === 0) {
      setReserving(false);
      setReservationId("");
      setExpiresAt("");
      setSecondsLeft(0);
      localStorage.removeItem(ACTIVE_RES_ID_KEY);
      return;
    }

    const token = ensureReservationToken();

    const reserve = async () => {
      setReserving(true);
      setError("");
      setResult(null);

      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, items: cart }),
      });

      const data = await res.json();
      if (!res.ok) {
        setReserving(false);
        setReservationId("");
        setExpiresAt("");
        setSecondsLeft(0);
        localStorage.removeItem(ACTIVE_RES_ID_KEY);
        setError(data.error || "Could not reserve stock.");
        return;
      }

      setReservationId(data.reservationId);
      setExpiresAt(data.expiresAt);
      localStorage.setItem(ACTIVE_RES_ID_KEY, data.reservationId);
      setHoldMinutes(Number(data.holdMinutes ?? HOLD_MINUTES));

      setReserving(false);
    };
    
    reserve();
  }, [cart]);

  // Countdown ticker
  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const exp = new Date(expiresAt).getTime();
      const now = Date.now();
      const left = Math.ceil((exp - now) / 1000);
      setSecondsLeft(left);
    };

    tick();

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(tick, 500);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [expiresAt]);

  const holdExpired = expiresAt ? secondsLeft <= 0 : false;

  async function goBack(to: "/cart" | "/") {
    await cancelHoldBestEffort();
    window.location.href = to;
  }

  async function placeOrder() {
    setError("");
    setResult(null);

    if (reserving) {
      setError("Reserving stock… please wait.");
      return;
    }

    if (!reservationId || !expiresAt) {
      setError("No active reservation. Please refresh checkout.");
      return;
    }

    if (holdExpired) {
      setError(`Your ${holdMinutes}-minute hold expired. Please refresh checkout to reserve again.`);
      return;
    }

        const addressStr = formatAddress({
      street,
      unit,
      city,
      postal: normalizeCanadianPostal(postal),
    });

    if (!name || !phone || !street || !city || !postal) {
      setError("Please fill name, phone, street number and address, city, and postal code.");
      return;
    }

    if (!isValidCanadianPostal(postal)) {
      setError("Please enter a valid Canadian postal code (e.g., M4B 1B3).");
      return;
    }

    if (remember) {
      saveCustomer({
        name,
        phone,
        street,
        unit,
        city,
        postal: normalizeCanadianPostal(postal),
        // Keep old field too (helpful if you ever roll back UI)
        address: addressStr,
      });
    }

    const token = ensureReservationToken();

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reservationId,
        token,
                customer: {
  name,
  phone,
  address: addressStr,
  notes,
  customer_confirmed_etransfer: customerConfirmedEtransfer,
  address_parts: { street, unit, city, postal: normalizeCanadianPostal(postal) }, // optional extra
},
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Order failed.");
      return;
    }

    // Success: clear cart + clear active reservation marker
    localStorage.removeItem(ACTIVE_RES_ID_KEY);
    saveCart([]);
    setCart([]);
    setResult(data);
     console.log("ORDER RESULT:", data);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Checkout</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => goBack("/cart")} style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
            Back to cart
          </button>
          <button onClick={() => goBack("/")} style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
            Back to shop
          </button>
        </div>
      </header>

      <p style={{ marginTop: 8 }}>Before placing your order, please pay subtotal below by e-transfer to: orphansmago@gmail.com</p>

      <div style={{ marginTop: 14, fontWeight: 800 }}>Subtotal: {formatMoney(subtotal)}</div>

      <section
        className="mt-3 rounded-xl border px-4 py-3"
        style={{
          borderColor: holdExpired ? "var(--danger)" : "var(--border)",
          background: holdExpired ? "rgba(255,0,0,0.06)" : "transparent",
          maxWidth: 520,
        }}
      >
        <div style={{ fontWeight: 900 }}>
          {reserving ? "Reserving stock…" : holdExpired ? "Hold expired" : "Stock reserved"}
        </div>

        <div style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          {reserving
            ? `We’re holding your items for ${holdMinutes} minutes so they don’t get sold out while you checkout.`
            : holdExpired
              ? "Your hold expired. Refresh this page to reserve again."
              : `Time left: ${formatMMSS(secondsLeft)} (${holdMinutes}-minute hold)`}
        </div>
      </section>

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
  Street number and address
  <input
    value={street}
    onChange={(e) => setStreet(e.target.value)}
    placeholder="123 Main St"
    autoComplete="street-address"
    style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }}
  />
</label>

        <label>
          Unit (optional)
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Apt 4B"
            autoComplete="address-line2"
            style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 10 }}>
          <label>
            City
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }}
            />
          </label>

          <label>
            Postal code
            <input
              value={postal}
              onChange={(e) => setPostal(normalizeCanadianPostal(e.target.value))}
              placeholder="M4B 1B3"
              autoComplete="postal-code"
              style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }}
            />
          </label>
        </div>
        <label>
          Notes (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--input)", borderRadius: 10 }} />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember my info on this device
        </label>
       <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
  <input
    type="checkbox"
    checked={customerConfirmedEtransfer}
    onChange={(e) => setCustomerConfirmedEtransfer(e.target.checked)}
  />
  I confirm I have completed the e-transfer for this order.
</label>

        <button
          onClick={placeOrder}
          disabled={reserving || holdExpired || cart.length === 0}
          className="w-full rounded-xl border px-4 py-3 font-extrabold transition
                     disabled:cursor-not-allowed disabled:opacity-60
                     border-green-700 bg-green-600 text-white hover:bg-green-700
                     dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {reserving ? "Reserving…" : holdExpired ? "Hold expired" : "Place order"}
        </button>

        {error ? (
  <div
    ref={errorRef}
    style={{
      color: "var(--danger)",
      marginTop: 10,
      scrollMarginTop: 24, // nice spacing when scrolling
      fontWeight: 700,
    }}
  >
    {error}
  </div>
) : null}

        {result ? (
  <div
    style={{
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: 16,
      background: "rgba(16,185,129,0.06)", // subtle green tint
    }}
  >
    {/* Header */}
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16a34a",
          color: "white",
          fontWeight: 900,
          flex: "0 0 auto",
        }}
        aria-hidden
      >
        ✓
      </div>

      <div>
        <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.2 }}>Order placed!</div>
        <div style={{ marginTop: 2, color: "var(--muted-foreground)" }}>
          Thank you for supporting sick and orphaned children in the most deprived regions.
        </div>
      </div>
    </div>

    {/* Order ID */}
    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
  <div style={{ fontWeight: 900 }}>Order ID</div>

  <code
  style={{
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    fontWeight: 900,
  }}
>
    {result.publicOrderId}
  </code>

  <button
    type="button"
    onClick={() => {
      if (!result.publicOrderId) return;
      navigator.clipboard?.writeText(result.publicOrderId);
    }}
    style={{
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--button-bg)",
  color: "var(--foreground)",
  fontWeight: 900,
  cursor: "pointer",
}}
  >
    Copy ID
  </button>
</div>


    {/* Next steps */}
    <div
  style={{
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
  }}
>
      <div style={{ fontWeight: 950, marginBottom: 8 }}>Next steps</div>

      <ol style={{ margin: 0, paddingLeft: 18, color: "var(--foreground)", display: "grid", gap: 6 }}>
  <li>
    Send an e-transfer to <b>{result.etransfer?.email}</b>
  </li>
  <li>
    Order total: <b>{formatMoney(result.total_cents)}</b>
  </li>
  <li>
    Please include your <b>name</b> and/or <b>Order ID</b> in the e-transfer message.
  </li>
</ol>


      {/* E-transfer box */}
      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 900 }}>Send e-transfer to</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>{result.etransfer?.name}</div>
          <code
  style={{
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card-2)",
    color: "var(--foreground)",
    fontWeight: 900,
  }}
>
            {result.etransfer?.email}
          </code>

          <button
            type="button"
            onClick={() => {
              const email = result.etransfer?.email || "";
              if (!email) return;
              navigator.clipboard?.writeText(email);
            }}
            style={{
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--button-bg)",
  color: "var(--foreground)",
  fontWeight: 900,
  cursor: "pointer",
}}

          >
            Copy email
          </button>
        </div>

        {result.etransfer?.message ? (
          <div style={{ marginTop: 8, color: "var(--muted-foreground)" }}>{result.etransfer.message}</div>
        ) : null}
      </div>
    </div>

    {/* Help + actions */}
    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div style={{ color: "var(--muted-foreground)" }}>
        Questions/Concerns?{" "}
        <span style={{ fontWeight: 900, color: "inherit" }}>
          Contact: 647-922-5320
        </span>
      </div>

      <button
        onClick={() => goBack("/")}
        style={{
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--foreground)",
  color: "var(--background)",
  fontWeight: 950,
  cursor: "pointer",
}}
      >
        Back to shop
      </button>
    </div>
  </div>
) : null}

      </div>
    </main>
  );
}
