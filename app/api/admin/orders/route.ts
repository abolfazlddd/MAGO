import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

/**
 * GET /api/admin/orders
 * Returns orders + items + product names for admin dashboard
 */
export async function GET(req: Request) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        status,
        customer_name,
        customer_phone,
        customer_address,
        notes,
        subtotal_cents,
        created_at,
        order_items (
  id,
  qty,
  unit_price_cents,
  product_name,
  product_image_url,
  product:products (
    id,
    name
  )
)
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = (data ?? []).map((o: any) => ({
      id: o.id,
      status: o.status,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      customer_address: o.customer_address,
      notes: o.notes ?? "",
      subtotal_cents: o.subtotal_cents ?? 0,
      created_at: o.created_at,
      order_items: (o.order_items ?? []).map((it: any) => {
        const unit = Number(it.unit_price_cents ?? 0);
        const qty = Number(it.qty ?? 0);
        return {
          id: it.id,
          product_id: it.product?.id ?? null,
          product_name: it.product_name ?? it.product?.name ?? "(Deleted product)",
          qty,
          unit_price_cents: unit,
          line_total_cents: unit * qty,
        };
      }),
    }));

    return NextResponse.json({ orders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/orders
 * Body: { id: string, status: "pending" | "paid" | "fulfilled" | "cancelled" }
 */
export async function PUT(req: Request) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const id = body?.id;
    const status = body?.status;

    if (!id || !status) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const allowed = new Set(["pending", "paid", "fulfilled", "cancelled"]);
    if (!allowed.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ order: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
export async function DELETE(req: Request) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);

    // OPTION A: delete a single order by id
    const id = url.searchParams.get("id");
    if (id) {
      // delete order_items first
      const delItems = await supabaseAdmin
        .from("order_items")
        .delete()
        .eq("order_id", id);

      if (delItems.error) {
        return NextResponse.json({ error: delItems.error.message }, { status: 500 });
      }

      // then delete the order
      const delOrder = await supabaseAdmin
        .from("orders")
        .delete()
        .eq("id", id);

      if (delOrder.error) {
        return NextResponse.json({ error: delOrder.error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, deleted: { id } });
    }

    // OPTION B: delete all orders before a given date
    // Example: /api/admin/orders?before=2026-01-01T00:00:00.000Z
    const before = url.searchParams.get("before");
    if (before) {
      const { data: orders, error: selErr } = await supabaseAdmin
        .from("orders")
        .select("id")
        .lt("created_at", before);

      if (selErr) {
        return NextResponse.json({ error: selErr.message }, { status: 500 });
      }

      const ids = (orders ?? []).map((o: any) => o.id);
      if (ids.length === 0) {
        return NextResponse.json({ ok: true, deletedCount: 0 });
      }

      await supabaseAdmin.from("order_items").delete().in("order_id", ids);
      await supabaseAdmin.from("orders").delete().in("id", ids);

      return NextResponse.json({ ok: true, deletedCount: ids.length, before });
    }

    return NextResponse.json(
      { error: "Provide ?id=ORDER_ID or ?before=ISO_DATE" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}