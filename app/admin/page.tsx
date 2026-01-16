"use client";

import React, { useEffect, useMemo, useState } from "react";

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
  status: "pending" | "paid" | "fulfilled" | "cancelled";
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_cents: number;
  items?: OrderItem[];
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

  // Add product form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriceCents, setNewPriceCents] = useState<number>(500);
  const [newStock, setNewStock] = useState<number>(10);
  const [newTrackStock, setNewTrackStock] = useState<boolean>(true);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);

  // Inline edit (one at a time)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<{
    name: string;
    description: string;
    price_cents: number;
    stock_on_hand: number;
    track_stock: boolean;
    image_url: string;
  } | null>(null);

  // Delete safeguards / undo (orders)
  const [pendingDelete, setPendingDelete] = useState<
    | null
    | { type: "order"; orderId: string; fireAt: number }
    | { type: "purge"; beforeIso: string; fireAt: number }
  >(null);

  const [purgeBefore, setPurgeBefore] = useState<string>(""); // YYYY-MM-DD

  const loggedIn = useMemo(() => !!token, [token]);

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
      // 1) sale status (public)
      await loadSaleStatus();

      // 2) products (admin endpoint includes hidden)
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

      // 3) orders (admin)
      const oRes = await fetch("/api/admin/orders", {
        method: "GET",
        headers: { authorization: `Bearer ${authToken}` },
      });
      const oJson = await safeJson(oRes);

      if (!oRes.ok) {
        setError((prev) => prev || (oJson && oJson.error) || `Failed to load orders (HTTP ${oRes.status})`);
        setOrders([]);
      } else {
        setOrders(oJson?.orders || []);
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
    setError("");
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

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/upload-image", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await safeJson(res);

    if (!res.ok) {
      throw new Error((data && data.error) || `Image upload failed (HTTP ${res.status})`);
    }

    if (!data?.url) throw new Error("Upload succeeded but no url returned from /api/upload-image");
    return data.url as string;
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!newName.trim()) {
      setError("Name is required.");
      return;
    }

    setBusy(true);
    try {
      const image_url = await uploadImageIfNeeded(newImageFile);

      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          price_cents: Number(newPriceCents),
          track_stock: newTrackStock,
          stock_on_hand: newTrackStock ? Number(newStock) : 0,
          image_url,
          is_active: true,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        setError((data && data.error) || `Failed to add product (HTTP ${res.status})`);
        return;
      }

      // reset form
      setNewName("");
      setNewDescription("");
      setNewPriceCents(500);
      setNewStock(10);
      setNewTrackStock(true);
      setNewImageFile(null);

      await loadAll(token);
    } catch (e: any) {
      setError(e?.message || "Failed to add product.");
    } finally {
      setBusy(false);
    }
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

async function hardDeleteProduct(id: string) {
  setError("");

  const ok = confirm(
    "Are you sure you want to permanently delete this product?\n\nThis cannot be undone."
  );

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

  function startEditingProduct(p: Product) {
    setError("");
    setEditingProductId(p.id);
    setProductDraft({
      name: p.name ?? "",
      description: p.description ?? "",
      price_cents: Number(p.price_cents ?? 0),
      stock_on_hand: Number(p.stock_on_hand ?? 0),
      track_stock: p.track_stock === true,
      image_url: p.image_url ?? "",
    });
  }

  function cancelEditingProduct() {
    setEditingProductId(null);
    setProductDraft(null);
  }

  async function saveEditingProduct(id: string) {
    if (!productDraft) return;

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

    await updateProduct(id, {
      name: productDraft.name.trim(),
      description: productDraft.description.trim() || null,
      price_cents: Number(productDraft.price_cents),
      track_stock: productDraft.track_stock,
      stock_on_hand: productDraft.track_stock ? Number(productDraft.stock_on_hand) : 0,
      image_url: productDraft.image_url.trim() || null,
    } as any);

    cancelEditingProduct();
  }

  async function setOrderStatus(orderId: string, status: Order["status"]) {
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

  function scheduleDeleteOrder(orderId: string) {
    setError("");

    const code = orderId.slice(-6).toUpperCase();
    const typed = prompt(
      `This will permanently delete the order and its items.\n\nType ${code} to confirm deletion:`,
      ""
    );
    if (!typed) return;

    if (typed.trim().toUpperCase() !== code) {
      setError("Delete cancelled (confirmation code did not match).");
      return;
    }

    const fireAt = Date.now() + 10_000;
    setPendingDelete({ type: "order", orderId, fireAt });

    setTimeout(async () => {
      let shouldDelete = false;
      setPendingDelete((cur) => {
        if (cur && cur.type === "order" && cur.orderId === orderId) shouldDelete = true;
        return cur;
      });

      if (shouldDelete) {
        await deleteOrderNow(orderId);
        setPendingDelete(null);
      }
    }, 10_000);
  }

  function schedulePurgeOrders() {
    setError("");

    if (!purgeBefore) {
      setError("Pick a date first.");
      return;
    }

    const beforeIso = new Date(`${purgeBefore}T00:00:00.000Z`).toISOString();

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
          <button onClick={handleLogin} style={{ padding: "10px 14px", fontWeight: 900 }}>
            Log in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 44, margin: "10px 0 0", fontWeight: 900 }}>Admin Dashboard</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => loadAll(token)} style={{ padding: "8px 12px", fontWeight: 900 }} disabled={busy}>
            Refresh
          </button>

          <a href="/" style={{ fontWeight: 900 }}>
            View shop
          </a>

          <button onClick={handleLogout} style={{ padding: "8px 12px", fontWeight: 900 }}>
            Log out
          </button>
        </div>
      </div>

      {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}

      {pendingDelete ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--danger-border)",
            background: "var(--danger-bg)",
          }}
        >
          <div style={{ fontWeight: 900 }}>
            {pendingDelete.type === "order"
              ? `Deleting order ${pendingDelete.orderId} in 10 seconds…`
              : `Purging orders before ${pendingDelete.beforeIso} in 15 seconds…`}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={undoPendingDelete} style={{ fontWeight: 900 }}>
              Undo
            </button>
            <div style={{ color: "var(--muted-foreground)" }}>Nothing is deleted until the timer completes.</div>
          </div>
        </div>
      ) : null}

      {/* Sale status */}
      <section style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Sale status</div>
        <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            Current: <b style={{ fontSize: 18 }}>{saleStatus.toUpperCase()}</b>
          </div>
          <button onClick={() => updateSaleStatus("open")} disabled={saleStatus === "open"}>
            Set Open
          </button>
          <button onClick={() => updateSaleStatus("closed")} disabled={saleStatus === "closed"}>
            Set Closed
          </button>
        </div>
      </section>

      {/* Add product */}
      <section style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Add product</div>

        <form onSubmit={addProduct} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
          />

          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description"
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--input)" }}
          />

          <div style={{ marginTop: 4, fontWeight: 800 }}>Product image (optional)</div>
          <input type="file" accept="image/*" onChange={(e) => setNewImageFile(e.target.files?.[0] ?? null)} />

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>Price (cents)</span>
              <input
                type="number"
                value={newPriceCents}
                onChange={(e) => setNewPriceCents(parseInt(e.target.value || "0", 10))}
                style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)", width: 120 }}
              />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={newTrackStock} onChange={(e) => setNewTrackStock(e.target.checked)} />
              <span>Track stock</span>
            </label>

            {newTrackStock ? (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>Stock</span>
                <input
                  type="number"
                  value={newStock}
                  onChange={(e) => setNewStock(parseInt(e.target.value || "0", 10))}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)", width: 120 }}
                />
              </label>
            ) : (
              <span style={{ color: "var(--muted-foreground)", fontWeight: 700 }}>Unlimited stock</span>
            )}
          </div>

          <button type="submit" style={{ padding: "10px 14px", fontWeight: 900 }} disabled={busy}>
            Add
          </button>
        </form>
      </section>

      {/* Products */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontWeight: 900 }}>Products</h2>

        {products.length === 0 ? (
          <p style={{ marginTop: 10, color: "var(--muted-foreground)" }}>No products yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {products.map((p) => {
              const isEditing = editingProductId === p.id;

              return (
                <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 280, flex: 1 }}>
                      {isEditing && productDraft ? (
                        <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 800 }}>Name</span>
                            <input
                              value={productDraft.name}
                              onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                              style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
                            />
                          </label>

                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 800 }}>Description</span>
                            <input
                              value={productDraft.description}
                              onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })}
                              style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
                            />
                          </label>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label style={{ display: "grid", gap: 4 }}>
                              <span style={{ fontWeight: 800 }}>Price (cents)</span>
                              <input
                                type="number"
                                value={productDraft.price_cents}
                                onChange={(e) =>
                                  setProductDraft({ ...productDraft, price_cents: parseInt(e.target.value || "0", 10) })
                                }
                                style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
                              />
                            </label>

                            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                              <input
                                type="checkbox"
                                checked={productDraft.track_stock}
                                onChange={(e) => setProductDraft({ ...productDraft, track_stock: e.target.checked })}
                              />
                              <span style={{ fontWeight: 800 }}>Track stock</span>
                            </label>

                            {productDraft.track_stock ? (
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 800 }}>Stock</span>
                                <input
                                  type="number"
                                  value={productDraft.stock_on_hand}
                                  onChange={(e) =>
                                    setProductDraft({
                                      ...productDraft,
                                      stock_on_hand: parseInt(e.target.value || "0", 10),
                                    })
                                  }
                                  style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
                                />
                              </label>
                            ) : (
                              <div style={{ color: "var(--muted-foreground)", fontWeight: 700 }}>Unlimited stock</div>
                            )}
                          </div>

                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 800 }}>Image URL</span>
                            <input
                              value={productDraft.image_url}
                              onChange={(e) => setProductDraft({ ...productDraft, image_url: e.target.value })}
                              style={{ padding: 8, borderRadius: 10, border: "1px solid var(--input)" }}
                            />
                          </label>

                          {productDraft.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productDraft.image_url}
                              alt="Preview"
                              style={{
                                width: 220,
                                height: 140,
                                objectFit: "cover",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                marginTop: 6,
                              }}
                            />
                          ) : null}

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            <button onClick={() => saveEditingProduct(p.id)} style={{ fontWeight: 900 }}>
                              Save
                            </button>
                            <button onClick={cancelEditingProduct}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            {p.name}{" "}
                            <span style={{ color: "var(--muted-foreground)", fontWeight: 700 }}>
                              ({p.is_active ? "Visible" : "Hidden"})
                            </span>
                          </div>

                          {p.description ? (
                            <div style={{ color: "var(--muted-foreground)", marginTop: 4 }}>{p.description}</div>
                          ) : null}

                          <div style={{ marginTop: 6 }}>
                            <b>Price:</b> {formatMoney(p.price_cents)} • <b>Stock:</b>{" "}
                            {p.track_stock === false ? "Unlimited" : p.stock_on_hand}
                          </div>

                          <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
                            <code>{p.id}</code>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isEditing && p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        style={{
                          width: 140,
                          height: 90,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                        }}
                      />
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={isEditing} onClick={() => updateProduct(p.id, { is_active: !p.is_active })}>
                      {p.is_active ? "Hide" : "Unhide"}
                    </button>

                    <button
                      onClick={() => {
                        if (editingProductId && editingProductId !== p.id) {
                          const ok = confirm("You are editing another product. Discard changes and edit this one?");
                          if (!ok) return;
                        }
                        startEditingProduct(p);
                      }}
                    >
                      Edit
                    </button>

                    <button
                      disabled={isEditing}
                      onClick={() => hardDeleteProduct(p.id)}
                      style={{ color: "crimson", fontWeight: 800 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Orders */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontWeight: 900 }}>Orders</h2>

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

        {orders.length === 0 ? (
          <p style={{ marginTop: 12, color: "var(--muted-foreground)" }}>No orders yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {o.customer_name} —{" "}
                      <span style={{ color: "var(--muted-foreground)" }}>{o.status.toUpperCase()}</span>
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

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setOrderStatus(o.id, "pending")}>Mark Unpaid</button>
                  <button onClick={() => setOrderStatus(o.id, "paid")}>Mark Paid</button>
                  <button onClick={() => setOrderStatus(o.id, "fulfilled")}>Mark Fulfilled</button>
                  <button onClick={() => setOrderStatus(o.id, "cancelled")}>Cancel</button>
                  <button onClick={() => scheduleDeleteOrder(o.id)} style={{ color: "crimson", fontWeight: 800 }}>
                    Delete Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p style={{ marginTop: 18, color: "var(--muted-foreground)" }}>
        Products loaded: {products.length} • Orders loaded: {orders.length}
      </p>
    </main>
  );
}