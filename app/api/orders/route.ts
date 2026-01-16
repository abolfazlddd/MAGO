import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type CartItem = { productId: string; qty: number };

// ---- Order numbering helpers (monthly sequence) ----
function getYearMonth(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // e.g. "2026-01"
}

function formatPublicOrderId(orderMonth: string, orderNumber: number) {
  return `ORD-${orderMonth}-${String(orderNumber).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const customer = body?.customer ?? {};
    const items: CartItem[] = body?.items ?? [];

    const name = String(customer?.name ?? "").trim();
    const phone = String(customer?.phone ?? "").trim();
    const address = String(customer?.address ?? "").trim();
    const notes = String(customer?.notes ?? "").trim();

    if (!name || !phone || !address) {
      return NextResponse.json(
        { error: "Missing required fields: name, phone, address." },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    // 1) Check if sale is open
    const { data: setting, error: settingErr } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "sale_status")
      .single();

    if (!settingErr && setting?.value === "closed") {
      return NextResponse.json(
        { error: "Ordering is currently closed." },
        { status: 403 }
      );
    }

    // 2) Load products and validate cart
    const productIds = [...new Set(items.map((i) => i.productId))].filter(Boolean);

    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id,name,image_url,price_cents,stock_on_hand,track_stock,is_active")
      .in("id", productIds);

    if (prodErr) {
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }

    const productById = new Map((products ?? []).map((p: any) => [p.id, p]));

    let subtotal_cents = 0;

    for (const ci of items) {
      const qty = Number(ci.qty ?? 0);

      if (!ci.productId || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
      }

      const p = productById.get(ci.productId);
      if (!p) {
        return NextResponse.json(
          { error: `Product not found: ${ci.productId}` },
          { status: 400 }
        );
      }

      if (!p.is_active) {
        return NextResponse.json(
          { error: `Product is not available: ${p.name}` },
          { status: 400 }
        );
      }

      // ✅ Match storefront/cart logic: only track stock when explicitly true
      const trackStock = p.track_stock === true;

      if (trackStock) {
        const stock = Number(p.stock_on_hand ?? 0);
        if (qty > stock) {
          return NextResponse.json(
            { error: `Not enough stock for "${p.name}". Requested ${qty}, available ${stock}.` },
            { status: 409 }
          );
        }
      }

      subtotal_cents += Number(p.price_cents ?? 0) * qty;
    }

    // 3) Get the next monthly sequential order number
    const orderMonth = getYearMonth();

    const { data: orderNumber, error: numErr } = await supabaseAdmin.rpc(
      "next_order_number",
      { p_year_month: orderMonth }
    );

    if (numErr) {
      return NextResponse.json({ error: numErr.message }, { status: 500 });
    }

    // 4) Create order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        status: "pending",
        customer_name: name,
        customer_phone: phone,
        customer_address: address,
        notes,
        subtotal_cents,
        order_month: orderMonth,
        order_number: orderNumber,
      })
      .select()
      .single();

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }

    // 5) Create order items (✅ snapshot product fields so orders survive product deletion)
    const orderItems = items.map((ci) => {
      const p = productById.get(ci.productId);

      return {
        order_id: order.id,
        product_id: ci.productId, // will become NULL if product is deleted later
        product_name: String(p?.name ?? "(Deleted product)"),
        product_image_url: p?.image_url ?? null,
        qty: Number(ci.qty),
        unit_price_cents: Number(p?.price_cents ?? 0),
      };
    });

    const { error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemsErr) {
      // best-effort rollback
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    // 6) Decrement stock (best-effort; not transactional)
    for (const ci of items) {
      const p = productById.get(ci.productId);
      const trackStock = p?.track_stock === true;

      if (trackStock) {
        const newStock = Number(p.stock_on_hand ?? 0) - Number(ci.qty ?? 0);

        await supabaseAdmin
          .from("products")
          .update({ stock_on_hand: newStock })
          .eq("id", ci.productId);
      }
    }

    // 7) Return payment instructions (+ short public order id)
    const etransferEmail = process.env.ETRANSFER_EMAIL || "";
    const etransferName = process.env.ETRANSFER_NAME || "";
    const dollars = (subtotal_cents / 100).toFixed(2);

    const publicOrderId = formatPublicOrderId(order.order_month, order.order_number);

    return NextResponse.json({
      orderId: order.id,
      publicOrderId,
      orderMonth: order.order_month,
      orderNumber: order.order_number,
      etransfer: {
        name: etransferName,
        email: etransferEmail,
        message: `Order ${publicOrderId} - $${dollars} - ${name}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
