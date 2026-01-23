"use client";

import React, { useEffect, useMemo, useState } from "react";
import { filterOrders, ordersToCsv } from "@/lib/orderFilters";
import { buildPackingSlipHtml } from "@/lib/packingSlip";
import { resolveProductImageUrl } from "@/lib/adminImage";


type SaleStatus = "open" | "closed";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  stock_on_hand: number;
  track_stock: boolean | null;
  image_url: string | null;
  is_active: boolean;
};

type OrderItem = {
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  price_cents: number;
};

type Order = {
  id: string;
  created_at: string;
  status: "pending" | "paid" | "fulfilled" | "cancelled" | any;
  payment_status?: "paid" | "unpaid" | any;
  prep_status?: "ready" | "not_ready" | any;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_cents: number;
  items?: OrderItem[];
  notes?: string;
  customer_confirmed_etransfer?: boolean | null;
  admin_note?: string;
};

function formatMoney(cents: number) {
  const dollars = (cents || 0) / 100;
  return dollars.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [saleStatus, setSaleStatus] = useState<SaleStatus>("open");

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [adminNoteDrafts, setAdminNoteDrafts] = useState<Record<string, string>>({});

  // Bulk selection for orders
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Orders view controls
  const [orderSearch, setOrderSearch] = useState<string>("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderHideCancelled, setOrderHideCancelled] = useState<boolean>(false);
  const [orderSort, setOrderSort] = useState<"newest" | "oldest" | "total_desc" | "total_asc">("newest");

  // Add product form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriceDollars, setNewPriceDollars] = useState<string>("5.00");
  const [newStock, setNewStock] = useState<number>(10);
  const [newTrackStock, setNewTrackStock] = useState<boolean>(true);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImageUrl, setNewImageUrl] = useState<string>("");
  const [createSuccess, setCreateSuccess] = useState<boolean>(false);
  // ✅ Section collapse/expand (accordion)
const [openSections, setOpenSections] = useState<Record<string, boolean>>({
  sale: true,
  addProduct: true,
  products: true,
  orders: true,
});

function toggleSection(key: keyof typeof openSections) {
  setOpenSections((cur) => ({ ...cur, [key]: !cur[key] }));
}


  // Inline edit (one at a time)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [productDraft, setProductDraft] = useState<{
    name: string;
    description: string;
    price_cents: number;
    stock_on_hand: number;
    track_stock: boolean;
    image_url: string;
  } | null>(null);

  // Delete safeguards / undo (purge)
  const [pendingDelete, setPendingDelete] = useState<null | { type: "purge"; beforeIso: string; fireAt: number }>(
    null
  );

  const [purgeBefore, setPurgeBefore] = useState<string>(""); // YYYY-MM-DD

  const loggedIn = useMemo(() => !!token, [token]);

  const visibleOrders = useMemo(() => {
    return filterOrders(orders, {
      status: orderStatusFilter,
      q: orderSearch,
      hideCancelled: orderHideCancelled,
      sort: orderSort,
    });
  }, [orders, orderHideCancelled, orderSearch, orderSort, orderStatusFilter]);

  const selectedVisibleOrders = useMemo(() => {
    if (selectedOrderIds.size === 0) return [] as Order[];
    return visibleOrders.filter((o) => selectedOrderIds.has(o.id));
  }, [selectedOrderIds, visibleOrders]);

  const allVisibleSelected = useMemo(() => {
    if (visibleOrders.length === 0) return false;
    return visibleOrders.every((o) => selectedOrderIds.has(o.id));
  }, [selectedOrderIds, visibleOrders]);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token") || "";
    if (saved) {
      setToken(saved);
      setTokenInput(saved);
      void loadAll(saved);
    } else {
      void loadSaleStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSaleStatus() {
    try {
      const res = await fetch("/api/settings", { method: "GET" });
      const data = await safeJson(res);
      if (res.ok && data?.sale_status) setSaleStatus(data.sale_status);
    } catch {
      // ignore
    }
  }

  async function loadAll(authToken: string) {
    setError("");
    setBusy(true);

    try {
      await loadSaleStatus();

      const pRes = await fetch("/api/admin/products/list", {
        method: "GET",
        headers: { authorization: `Bearer ${authToken}` },
      });
      const pJson = await safeJson(pRes);

      if (!pRes.ok) {
        setError((pJson && pJson.error) || `Failed to load products (HTTP ${pRes.status})`);
        setProducts([]);
      } else {
        setProducts(pJson?.products || []);
      }

      const oRes = await fetch("/api/admin/orders", {
        method: "GET",
        headers: { authorization: `Bearer ${authToken}` },
      });
      const oJson = await safeJson(oRes);

      if (!oRes.ok) {
        setError((prev) => prev || (oJson && oJson.error) || `Failed to load orders (HTTP ${oRes.status})`);
        setOrders([]);
      } else {
        const loaded = (oJson?.orders || []) as Order[];
        setOrders(loaded);

        // Keep selection stable but drop ids no longer present
        setSelectedOrderIds((cur) => {
          const next = new Set<string>();
          const ids = new Set<string>(loaded.map((o) => o.id));
          for (const id of cur) if (ids.has(id)) next.add(id);
          return next;
        });

        // initialize note drafts
        setAdminNoteDrafts((cur) => {
          const next = { ...cur };
          for (const o of loaded) {
            if (next[o.id] === undefined) next[o.id] = (o.admin_note ?? "") as string;
          }
          return next;
        });
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong loading admin data.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogin() {
    const t = tokenInput.trim();
    if (!t) {
      setError("Enter the admin password.");
      return;
    }
    setToken(t);
    sessionStorage.setItem("admin_token", t);
    void loadAll(t);
  }

  function handleLogout() {
    sessionStorage.removeItem("admin_token");
    setToken("");
    setTokenInput("");
    setProducts([]);
    setOrders([]);
    setEditingProductId(null);
    setProductDraft(null);
    setPendingDelete(null);
    setAdminNoteDrafts({});
    setError("");
  }

  function toggleSelectOrder(id: string) {
    setSelectedOrderIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedOrderIds((cur) => {
      const next = new Set(cur);
      if (allVisibleSelected) {
        // Unselect all visible
        for (const o of visibleOrders) next.delete(o.id);
      } else {
        // Select all visible
        for (const o of visibleOrders) next.add(o.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedOrderIds(new Set());
  }

  function openPrintWindow(html: string) {
  // Avoid noopener/noreferrer here; it can break document.write in some browsers.
  const w = window.open("", "_blank");
  if (!w) {
    setError("Your browser blocked the print window. Please allow popups for this site.");
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      // ignore
    }
  };

  // Some browsers don't reliably fire onload for about:blank.
  w.onload = triggerPrint;

  // Fallback in case onload doesn't fire.
  setTimeout(triggerPrint, 500);
}

  function printOneOrder(order: Order) {
    openPrintWindow(buildPackingSlipHtml([order]));
  }

  function printSelectedOrders() {
    if (selectedVisibleOrders.length === 0) {
      setError("Select at least one order to print.");
      return;
    }
    openPrintWindow(buildPackingSlipHtml(selectedVisibleOrders));
  }

  async function bulkUpdateOrders(patch: Record<string, any>) {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) {
      setError("Select at least one order.");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const res = await fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, patch }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError((data && data.error) || `Bulk update failed (HTTP ${res.status})`);
        return;
      }

      await loadAll(token);
    } catch (e: any) {
      setError(e?.message || "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSaleStatus(next: SaleStatus) {
    setError("");

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sale_status: next }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to update sale status (HTTP ${res.status})`);
      return;
    }

    setSaleStatus(next);
  }

  async function uploadImageIfNeeded(file: File | null): Promise<string | null> {
    if (!file) return null;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await safeJson(res);
    if (!res.ok) {
      setError((data && data.error) || `Failed to upload image (HTTP ${res.status})`);
      return null;
    }

    return data?.url || null;
  }

  async function createProduct() {
    setError("");
    setBusy(true);

    try {
      if (!newName.trim()) {
        setError("Name is required.");
        return;
      }
      const dollars = Number(newPriceDollars);

if (!Number.isFinite(dollars) || dollars < 0) {
  setError("Price must be a valid number (0 or more).");
  return;
}

// Convert to integer cents safely
const priceCents = Math.round(dollars * 100);
      if (newTrackStock && (!Number.isFinite(newStock) || newStock < 0)) {
        setError("Stock must be 0 or more.");
        return;
      }

      let imageUrl: string | null = null;
try {
  imageUrl = await resolveProductImageUrl({
    file: newImageFile,
    url: newImageUrl,
    upload: uploadImageIfNeeded,
    strategy: "exclusive", // create: force user to pick ONE
  });
} catch (e: any) {
  setError(e?.message || "Choose either an image upload OR an image URL.");
  return;
}

      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          price_cents: priceCents,
          track_stock: newTrackStock,
          stock_on_hand: newTrackStock ? Number(newStock) : 0,
          image_url: imageUrl,
          is_active: true,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        setError((data && data.error) || `Failed to create product (HTTP ${res.status})`);
        return;
      }

      setCreateSuccess(true);
setTimeout(() => setCreateSuccess(false), 2000);

setNewName("");
setNewDescription("");
setNewPriceDollars("5.00");
setNewStock(10);
setNewTrackStock(true);
setNewImageFile(null);
setNewImageUrl("");

await loadAll(token);
    } finally {
      setBusy(false);
    }
  }

  function startEditingProduct(p: Product) {
  setEditingProductId(p.id);
  setEditImageFile(null);
  setProductDraft({
      name: p.name || "",
      description: p.description || "",
      price_cents: p.price_cents ?? 0,
      stock_on_hand: p.stock_on_hand ?? 0,
      track_stock: p.track_stock !== false,
      image_url: p.image_url || "",
    });
  }

  function cancelEditingProduct() {
  setEditingProductId(null);
  setProductDraft(null);
  setEditImageFile(null);
}

  async function updateProduct(id: string, patch: Partial<Product>) {
    setError("");

    const res = await fetch("/api/admin/products", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, ...patch }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to update product (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function deleteProduct(id: string) {
    setError("");
    const ok = confirm("Delete this product?\n\nThis cannot be undone.");
    if (!ok) return;

    const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to delete product (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function saveEditingProduct() {
    setError("");
    const id = editingProductId;
    if (!id || !productDraft) return;

    if (!productDraft.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!Number.isFinite(productDraft.price_cents) || productDraft.price_cents < 0) {
      setError("Price (cents) must be 0 or more.");
      return;
    }
    if (productDraft.track_stock) {
      if (!Number.isFinite(productDraft.stock_on_hand) || productDraft.stock_on_hand < 0) {
        setError("Stock must be 0 or more.");
        return;
      }
    }

    let finalImageUrl: string | null = null;
try {
  finalImageUrl = await resolveProductImageUrl({
    file: editImageFile,
    url: productDraft.image_url,
    upload: uploadImageIfNeeded,
    strategy: "prefer-file", // edit: file wins
  });
} catch (e: any) {
  setError(e?.message || "Invalid image settings.");
  return;
}

await updateProduct(id, {
  name: productDraft.name.trim(),
  description: productDraft.description.trim() || null,
  price_cents: Number(productDraft.price_cents),
  track_stock: productDraft.track_stock,
  stock_on_hand: productDraft.track_stock ? Number(productDraft.stock_on_hand) : 0,
  image_url: finalImageUrl,
} as any);

    cancelEditingProduct();
  }

  async function setOrderStatus(orderId: string, status: any) {
    setError("");

    const res = await fetch("/api/admin/orders", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: orderId, status }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to update order (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function setOrderPaymentStatus(orderId: string, payment_status: "paid" | "unpaid") {
    setError("");
    const res = await fetch("/api/admin/orders", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: orderId, payment_status }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      setError((data && data.error) || `Failed to update payment status (HTTP ${res.status})`);
      return;
    }
    await loadAll(token);
  }

  async function setOrderPrepStatus(orderId: string, prep_status: "ready" | "not_ready") {
    setError("");
    const res = await fetch("/api/admin/orders", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: orderId, prep_status }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      setError((data && data.error) || `Failed to update prep status (HTTP ${res.status})`);
      return;
    }
    await loadAll(token);
  }

  async function saveOrderAdminNote(orderId: string) {
    setError("");
    const note = adminNoteDrafts[orderId] ?? "";

    const res = await fetch("/api/admin/orders", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: orderId, admin_note: note }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to save admin note (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function deleteOrderNow(orderId: string) {
    setError("");

    const res = await fetch(`/api/admin/orders?id=${encodeURIComponent(orderId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to delete order (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function purgeOrdersNow(beforeIso: string) {
    setError("");

    const res = await fetch(`/api/admin/orders?before=${encodeURIComponent(beforeIso)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    const data = await safeJson(res);

    if (!res.ok) {
      setError((data && data.error) || `Failed to purge orders (HTTP ${res.status})`);
      return;
    }

    await loadAll(token);
  }

  async function hardDeleteOrder(orderId: string) {
    setError("");

    const ok = confirm("Are you sure you want to permanently delete this order?\n\nThis cannot be undone.");
    if (!ok) return;

    await deleteOrderNow(orderId);
  }

  function schedulePurgeOrders() {
    setError("");

    if (!purgeBefore) {
      setError("Pick a date first.");
      return;
    }

    // ✅ local midnight (no trailing Z)
    const beforeIso = new Date(`${purgeBefore}T00:00:00`).toISOString();

    const typed = prompt(
      `This will permanently delete ALL orders created before:\n${beforeIso}\n\nType PURGE to confirm:`,
      ""
    );
    if (!typed) return;

    if (typed.trim().toUpperCase() !== "PURGE") {
      setError("Purge cancelled.");
      return;
    }

    const fireAt = Date.now() + 15_000;
    setPendingDelete({ type: "purge", beforeIso, fireAt });

    setTimeout(async () => {
      let shouldPurge = false;
      setPendingDelete((cur) => {
        if (cur && cur.type === "purge" && cur.beforeIso === beforeIso) shouldPurge = true;
        return cur;
      });

      if (shouldPurge) {
        await purgeOrdersNow(beforeIso);
        setPendingDelete(null);
      }
    }, 15_000);
  }

  function undoPendingDelete() {
    setPendingDelete(null);
  }

  function downloadVisibleOrdersCsv() {
    try {
      const csv = ordersToCsv(visibleOrders);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = `orders-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || "Failed to export CSV");
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 980,
    margin: "0 auto",
    padding: 20,
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  };
  // ✅ Section styling (makes sections more discernible)
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(0,0,0,0.03)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 950,
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const sectionBodyStyle: React.CSSProperties = {
  marginTop: 12,
};

const collapseBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontWeight: 900,
  cursor: "pointer",
  transition: "filter 120ms ease, transform 120ms ease",
};

  if (!loggedIn) {
    return (
      <main style={containerStyle}>
        <h1 style={{ fontSize: 44, margin: "10px 0 0", fontWeight: 900 }}>Admin Dashboard</h1>
        <p style={{ marginTop: 10, color: "var(--muted-foreground)" }}>Enter the admin password to continue.</p>

        {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin password"
            type="password"
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--input)", minWidth: 260 }}
          />
          <button
  onClick={handleLogin}
  style={{
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
    transition: "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.filter = "brightness(1.08)";
    e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.filter = "none";
    e.currentTarget.style.boxShadow = "0 1px 0 rgba(0,0,0,0.06)";
    e.currentTarget.style.transform = "scale(1)";
  }}
  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
>
  Log in
</button>
        </div>
      </main>
    );
  }

  return (
    <main style={containerStyle}>
      <nav
  style={{
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--background)",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  }}
>
  {[
    ["Sale", "#sale"],
    ["Add Product", "#add-product"],
    ["Products", "#products"],
    ["Orders", "#orders"],
  ].map(([label, href]) => (
    <a
      key={href}
      href={href}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        textDecoration: "none",
        fontWeight: 800,
        color: "inherit",
        background: "rgba(0,0,0,0.02)",
      }}
    >
      {label}
    </a>
  ))}
</nav>

      {pendingDelete ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "rgba(220,0,0,0.06)",
          }}
        >
          <div style={{ fontWeight: 900, color: "crimson" }}>Pending destructive action</div>
          <div style={{ marginTop: 6 }}>
            {`Purging orders before ${pendingDelete.beforeIso} in 15 seconds…`}
          </div>
          <button onClick={undoPendingDelete} style={{ marginTop: 8 }}>
            Undo
          </button>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #f5c2c2", background: "#fff5f5" }}>
          <b style={{ color: "crimson" }}>Error:</b> {error}
        </div>
      ) : null}

     <section id="sale" style={cardStyle}>
  <div style={sectionHeaderStyle}>
    <div style={sectionTitleStyle}>🟢 Sale Status</div>
    <button style={collapseBtnStyle} onClick={() => toggleSection("sale")} type="button">
      {openSections.sale ? "Hide" : "Show"}
    </button>
  </div>

  {openSections.sale ? (
    <div style={sectionBodyStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>
          Current:{" "}
          <span style={{ color: saleStatus === "open" ? "green" : "crimson" }}>
            {saleStatus.toUpperCase()}
          </span>
        </div>
        <button onClick={() => void updateSaleStatus("open")} disabled={saleStatus === "open"}>
          Open Sale
        </button>
        <button onClick={() => void updateSaleStatus("closed")} disabled={saleStatus === "closed"}>
          Close Sale
        </button>
      </div>
      

    </div>
  ) : null}
</section>

      <section id="add-product" style={cardStyle}>
  <div style={sectionHeaderStyle}>
    <div style={sectionTitleStyle}>➕ Add Product</div>
    <button style={collapseBtnStyle} onClick={() => toggleSection("addProduct")} type="button">
      {openSections.addProduct ? "Hide" : "Show"}
    </button>
  </div>

  {openSections.addProduct ? (
    <div style={sectionBodyStyle}>
      <div style={{ marginTop: 10, display: "grid", gap: 10, maxWidth: 520 }}>
        <label>
          Name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
          />
        </label>

        <label>
          Description
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
          />
        </label>

        <label>
          Price ($)
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={newPriceDollars}
            onChange={(e) => setNewPriceDollars(e.target.value)}
            placeholder="e.g. 12.50"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={newTrackStock} onChange={(e) => setNewTrackStock(e.target.checked)} />
          Track stock
        </label>

        {newTrackStock ? (
          <label>
            Stock on hand
            <input
              type="number"
              value={newStock}
              onChange={(e) => setNewStock(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
            />
          </label>
        ) : null}

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800 }}>Image (optional)</div>

          <label
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "white",
              color: "#111827",
              fontWeight: 800,
              cursor: "pointer",
              width: "fit-content",
              userSelect: "none",
              transition: "transform 120ms ease, filter 120ms ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.98)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            📎 Choose image
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => setNewImageFile(e.target.files?.[0] || null)}
            />
          </label>

          <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
            {newImageFile ? `Selected: ${newImageFile.name}` : "No image selected"}
          </div>
        </div>
        <label>
  Image URL (optional)
  <input
    value={newImageUrl}
    onChange={(e) => setNewImageUrl(e.target.value)}
    placeholder="https://example.com/image.jpg"
    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
  />
</label>

<div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
  Use <b>either</b> upload <b>or</b> URL (not both).
</div>

        <button
          onClick={() => void createProduct()}
          disabled={busy}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: createSuccess ? "#16a34a" : "#111827",
            color: "white",
            fontWeight: 900,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.75 : 1,
            transition: "transform 120ms ease, filter 120ms ease, background 120ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {createSuccess ? "Created ✓" : busy ? "Creating…" : "Create Product"}
        </button>
      </div>
    </div>
  ) : null}
</section>

      <section id="products" style={cardStyle}>
  <div style={sectionHeaderStyle}>
    <div style={sectionTitleStyle}>📦 Products</div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ color: "var(--muted-foreground)", fontWeight: 800, fontSize: 13 }}>
        {products.length} total
      </div>
      <button style={collapseBtnStyle} onClick={() => toggleSection("products")} type="button">
        {openSections.products ? "Hide" : "Show"}
      </button>
    </div>
  </div>

  {openSections.products ? (
    <div style={sectionBodyStyle}>
      {products.length === 0 ? (
        <p style={{ marginTop: 12, color: "var(--muted-foreground)" }}>No products loaded.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {products.map((p) => {
            const isEditing = editingProductId === p.id;

            return (
              <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                {!isEditing ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 280 }}>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      <div style={{ color: "var(--muted-foreground)" }}>
                        {formatMoney(p.price_cents)} •{" "}
                        {p.track_stock !== false ? `Stock: ${p.stock_on_hand}` : "Stock not tracked"}
                      </div>
                      {p.description ? <div style={{ marginTop: 6, color: "#444" }}>{p.description}</div> : null}
                      {p.image_url ? (
                        <div style={{ marginTop: 8 }}>
                          <img src={p.image_url} alt="" style={{ width: 140, borderRadius: 10 }} />
                        </div>
                      ) : null}
                      <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
                        <code>{p.id}</code> • {p.is_active ? "ACTIVE" : "HIDDEN"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button onClick={() => startEditingProduct(p)}>Edit</button>
                      <button
                        onClick={() => void updateProduct(p.id, { is_active: !p.is_active })}
                        style={{ fontWeight: 800 }}
                      >
                        {p.is_active ? "Hide" : "Unhide"}
                      </button>
                      <button onClick={() => void deleteProduct(p.id)} style={{ color: "crimson", fontWeight: 800 }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ) : productDraft ? (
                  <div style={{ display: "grid", gap: 10, maxWidth: 620 }}>
                    <div style={{ fontWeight: 900 }}>Editing: {p.name}</div>

                    <label>
                      Name
                      <input
                        value={productDraft.name}
                        onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
                      />
                    </label>

                    <label>
                      Description
                      <textarea
                        value={productDraft.description}
                        onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
                      />
                    </label>

                    <label>
                      Price (cents)
                      <input
                        type="number"
                        value={productDraft.price_cents}
                        onChange={(e) => setProductDraft({ ...productDraft, price_cents: Number(e.target.value) })}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
                      />
                    </label>

                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={productDraft.track_stock}
                        onChange={(e) => setProductDraft({ ...productDraft, track_stock: e.target.checked })}
                      />
                      Track stock
                    </label>

                    {productDraft.track_stock ? (
                      <label>
                        Stock on hand
                        <input
                          type="number"
                          value={productDraft.stock_on_hand}
                          onChange={(e) => setProductDraft({ ...productDraft, stock_on_hand: Number(e.target.value) })}
                          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
                        />
                      </label>
                    ) : null}

                    <div style={{ display: "grid", gap: 6 }}>
  <div style={{ fontWeight: 800 }}>Image (optional)</div>

  <label
    style={{
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.14)",
      background: "white",
      color: "#111827",
      fontWeight: 800,
      cursor: "pointer",
      width: "fit-content",
      userSelect: "none",
      transition: "transform 120ms ease, filter 120ms ease",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.98)")}
    onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
  >
    📎 Choose image
    <input
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
    />
  </label>

  <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
    {editImageFile ? `Selected: ${editImageFile.name} (will replace URL)` : "No new upload selected"}
  </div>

  <label>
    Image URL
    <input
      value={productDraft.image_url}
      onChange={(e) => setProductDraft({ ...productDraft, image_url: e.target.value })}
      placeholder="https://example.com/image.jpg"
      style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
    />
  </label>

  <button
    type="button"
    onClick={() => {
      setEditImageFile(null);
      setProductDraft({ ...productDraft, image_url: "" });
    }}
    style={{ color: "crimson", fontWeight: 900, width: "fit-content" }}
  >
    Remove image
  </button>
</div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => void saveEditingProduct()} style={{ fontWeight: 900 }}>
                        Save
                      </button>
                      <button onClick={cancelEditingProduct}>Cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null}
</section>

      <section id="orders" style={cardStyle}>
  <div style={sectionHeaderStyle}>
    <div style={sectionTitleStyle}>🧾 Orders</div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ color: "var(--muted-foreground)", fontWeight: 800, fontSize: 13 }}>
        Showing {visibleOrders.length} / {orders.length}
      </div>
      <button
  style={collapseBtnStyle}
  onClick={() => toggleSection("orders")}
  type="button"
  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
  onMouseLeave={(e) => {
    e.currentTarget.style.filter = "none";
    e.currentTarget.style.transform = "scale(1)";
  }}
  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
>
  {openSections.orders ? "Hide" : "Show"}
</button>
    </div>
  </div>

  {openSections.orders ? (
    <div style={sectionBodyStyle}>
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card-2)",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            placeholder="Search name, phone, address, id, notes, items…"
            style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)", minWidth: 280 }}
          />

          <select
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={orderSort}
            onChange={(e) => setOrderSort(e.target.value as any)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="total_desc">Total: high → low</option>
            <option value="total_asc">Total: low → high</option>
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={orderHideCancelled}
              onChange={(e) => setOrderHideCancelled(e.target.checked)}
            />
            Hide cancelled
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={downloadVisibleOrdersCsv} style={{ fontWeight: 900 }}>
            Export CSV
          </button>
          <button
            onClick={() => {
              setOrderSearch("");
              setOrderStatusFilter("all");
              setOrderHideCancelled(false);
              setOrderSort("newest");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card-2)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", userSelect: "none" }}>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
            Select all visible
          </label>
          <div style={{ color: "var(--muted-foreground)", fontWeight: 800 }}>
            Selected: {selectedOrderIds.size}
          </div>
          <button onClick={clearSelection} disabled={selectedOrderIds.size === 0}>
            Clear
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={selectedOrderIds.size === 0} onClick={() => void bulkUpdateOrders({ payment_status: "unpaid" })}>
            Bulk: Not confirmed
          </button>
          <button disabled={selectedOrderIds.size === 0} onClick={() => void bulkUpdateOrders({ payment_status: "paid" })}>
            Bulk: Admin confirmed
          </button>
          <button disabled={selectedOrderIds.size === 0} onClick={() => void bulkUpdateOrders({ prep_status: "not_ready" })}>
            Bulk: Not ready
          </button>
          <button disabled={selectedOrderIds.size === 0} onClick={() => void bulkUpdateOrders({ prep_status: "ready" })}>
            Bulk: Ready
          </button>
          <button
            disabled={selectedOrderIds.size === 0}
            onClick={() => void bulkUpdateOrders({ status: "fulfilled" })}
            style={{ fontWeight: 900 }}
          >
            Bulk: Fulfilled
          </button>
          <button
            disabled={selectedOrderIds.size === 0}
            onClick={() => void bulkUpdateOrders({ status: "cancelled" })}
            style={{ color: "crimson", fontWeight: 900 }}
          >
            Bulk: Cancel
          </button>
          <button disabled={selectedVisibleOrders.length === 0} onClick={printSelectedOrders} style={{ fontWeight: 900 }}>
            Bulk print slips
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card-2)",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Purge old orders (advanced)</div>
        <div style={{ color: "var(--muted-foreground)", marginBottom: 10 }}>
          Permanently deletes orders created <b>before</b> the selected date. This cannot be undone after the timer
          finishes.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={purgeBefore}
            onChange={(e) => setPurgeBefore(e.target.value)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
          />
          <button onClick={schedulePurgeOrders} style={{ color: "crimson", fontWeight: 900 }}>
            Purge Orders
          </button>
        </div>
      </div>

      {visibleOrders.length === 0 ? (
        <p style={{ marginTop: 12, color: "var(--muted-foreground)" }}>No orders yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {visibleOrders.map((o) => (
            <div key={o.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    <label style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(o.id)}
                        onChange={() => toggleSelectOrder(o.id)}
                      />
                      <span>{o.customer_name}</span>
                    </label>
                    {" "}—{" "}
                    {String(o.status).toLowerCase() === "fulfilled" ? (
                      <span style={{ color: "green", fontWeight: 900 }}>FULFILLED</span>
                    ) : String(o.status).toLowerCase() === "cancelled" ? (
                      <span style={{ color: "crimson", fontWeight: 900 }}>CANCELLED</span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)", fontWeight: 900 }}>ACTIVE</span>
                    )}
                  </div>

                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
    color: "var(--foreground)",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      <span
  style={{
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "white",
    fontSize: 12,
    fontWeight: 900,
    color: o.customer_confirmed_etransfer ? "#065f46" : "#92400e",
  }}
>
  Customer payment declaration:{" "}
  {o.customer_confirmed_etransfer ? "CONFIRMED SENT" : "NOT CONFIRMED"}
</span>
                      Admin confirmation: {String(o.payment_status ?? "unpaid") === "paid" ? "CONFIRMED" : "NOT CONFIRMED"}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
    color: "var(--foreground)",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      Admin: {String(o.prep_status ?? "not_ready").replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, color: "var(--muted-foreground)" }}>
                    {o.customer_phone} • {o.customer_address}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <b>Total:</b> {formatMoney(o.total_cents)}
                  </div>
                  <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
                    <code>{o.id}</code> • {new Date(o.created_at).toLocaleString()}
                  </div>

                  {(o.notes || o.admin_note) ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8, maxWidth: 620 }}>
                      {o.notes ? (
                        <div style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}>
                          <div style={{ fontWeight: 900, marginBottom: 6 }}>Customer note</div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{o.notes}</div>
                        </div>
                      ) : null}

                      <div style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Admin note</div>
                        <div style={{ whiteSpace: "pre-wrap", color: "#333" }}>
                          {(o.admin_note ?? "").toString() || <span style={{ color: "#777" }}>No admin note.</span>}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {o.items && o.items.length ? (
                  <div style={{ minWidth: 260 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Items</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#444" }}>
                      {o.items.map((it, idx) => (
                        <li key={idx}>
                          {it.product_name || it.product_id || "Item"} × {it.quantity} ({formatMoney(it.price_cents)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 620 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 900 }}>Edit admin note</div>
                  <textarea
                    value={adminNoteDrafts[o.id] ?? o.admin_note ?? ""}
                    onChange={(e) => setAdminNoteDrafts((cur) => ({ ...cur, [o.id]: e.target.value }))}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
                    placeholder="Add internal note (e.g., customer requested change, substitutions, etc.)"
                  />
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => void saveOrderAdminNote(o.id)} style={{ fontWeight: 900 }}>
                    Save note
                  </button>
                  <button onClick={() => setAdminNoteDrafts((cur) => ({ ...cur, [o.id]: (o.admin_note ?? "").toString() }))}>
                    Reset
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  disabled={["fulfilled", "cancelled"].includes(String(o.status).toLowerCase())}
                  onClick={() => void setOrderPaymentStatus(o.id, "unpaid")}
                >
                  Mark Unpaid
                </button>
                <button
                  disabled={["fulfilled", "cancelled"].includes(String(o.status).toLowerCase())}
                  onClick={() => void setOrderPaymentStatus(o.id, "paid")}
                >
                  Mark Paid
                </button>
                <button
                  disabled={["fulfilled", "cancelled"].includes(String(o.status).toLowerCase())}
                  onClick={() => void setOrderPrepStatus(o.id, "not_ready")}
                >
                  Not ready
                </button>
                <button
                  disabled={["fulfilled", "cancelled"].includes(String(o.status).toLowerCase())}
                  onClick={() => void setOrderPrepStatus(o.id, "ready")}
                >
                  Ready
                </button>
                <button onClick={() => void setOrderStatus(o.id, "fulfilled")} style={{ fontWeight: 900 }}>
                  Mark Fulfilled
                </button>
                <button onClick={() => void setOrderStatus(o.id, "cancelled")} style={{ color: "crimson", fontWeight: 900 }}>
                  Cancel
                </button>
                <button onClick={() => printOneOrder(o)} style={{ fontWeight: 900 }}>
                  Print slip
                </button>
                <button onClick={() => void hardDeleteOrder(o.id)} style={{ color: "crimson", fontWeight: 800 }}>
                  Delete Order
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null}
</section>

      <p style={{ marginTop: 18, color: "var(--muted-foreground)" }}>
        Products loaded: {products.length} • Orders loaded: {orders.length}
      </p>
    </main>
  );
}
