import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/adminAuth";
import { normalizeOrderStatus, normalizePaymentStatus, normalizePrepStatus, computeOrderStatusFromPayment } from "@/lib/orderAdmin";

function checkAuth(req: Request) {
  return isAdminAuthorized(req);
}

/**
 * GET /api/admin/orders
 */
export async function GET(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let data: any[] | null = null;
let error: any = null;

const first = await supabaseAdmin
  .from("orders")
  .select(
    `
      id,
      status,
      payment_status,
      prep_status,
      customer_name,
      customer_phone,
      customer_address,
      notes,
      admin_note,
      customer_confirmed_etransfer,
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

data = first.data as any;
error = first.error as any;

    // Degrade gracefully if new columns don't exist yet
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missingPayment = msg.includes("payment_status") && msg.includes("does not exist");
      const missingPrep = msg.includes("prep_status") && msg.includes("does not exist");
      if (missingPayment || missingPrep) {
        const retry = await supabaseAdmin
          .from("orders")
          .select(
            `
            id,
            status,
            customer_name,
            customer_phone,
            customer_address,
            notes,
            admin_note,
            customer_confirmed_etransfer,
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
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const orders = (data ?? []).map((o: any) => {
      const order_items = (o.order_items ?? []).map((it: any) => {
        const unit = Number(it.unit_price_cents ?? 0);
        const qty = Number(it.qty ?? 0);
        return {
          id: it.id,
          product_id: it.product?.id ?? null,
          product_name: it.product_name ?? it.product?.name ?? "(Deleted product)",
          qty,
          unit_price_cents: unit,
          line_total_cents: unit * qty,
          product_image_url: it.product_image_url ?? null,
        };
      });

      const items = order_items.map((it: any) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.qty,
        price_cents: it.unit_price_cents,
      }));

      const subtotal_cents = Number(o.subtotal_cents ?? 0);

      return {
        id: o.id,
        status: o.status,
        payment_status: o.payment_status ?? (String(o.status).toLowerCase() === "paid" ? "paid" : "unpaid"),
        prep_status: o.prep_status ?? "not_ready",
        customer_confirmed_etransfer: !!o.customer_confirmed_etransfer,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        customer_address: o.customer_address,
        notes: o.notes ?? "",
        admin_note: o.admin_note ?? "",
        created_at: o.created_at,
        subtotal_cents,
        order_items,
        total_cents: subtotal_cents,
        items,
      };
    });

    return NextResponse.json({ orders });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/orders
 * Body:
 *   { id: string, status?: "pending"|"paid"|"fulfilled"|"cancelled"|"unpaid", payment_status?: "paid"|"unpaid", prep_status?: "ready"|"not_ready", admin_note?: string }
 */
export async function PUT(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const id = body?.id;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const patch: any = {};

    // New state fields
    if (body?.payment_status !== undefined) {
      const normPay = normalizePaymentStatus(body.payment_status);
      if (!normPay) return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 });
      patch.payment_status = normPay;
    }

    if (body?.prep_status !== undefined) {
      const normPrep = normalizePrepStatus(body.prep_status);
      if (!normPrep) return NextResponse.json({ error: "Invalid prep_status" }, { status: 400 });
      patch.prep_status = normPrep;
    }

    if (body?.status !== undefined) {
      const normalized = normalizeOrderStatus(body.status);
      if (!normalized) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      patch.status = normalized;
    }

    if (body?.admin_note !== undefined) {
      if (body.admin_note !== null && typeof body.admin_note !== "string") {
        return NextResponse.json({ error: "admin_note must be a string" }, { status: 400 });
      }
      patch.admin_note = (body.admin_note ?? "").toString();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // If caller updated payment_status but didn't explicitly send status, mirror payment onto status (unless terminal)
    if (patch.payment_status && patch.status === undefined) {
      // Need existing status to respect terminal dominance
      const { data: existing, error: selErr } = await supabaseAdmin.from("orders").select("status").eq("id", id).single();
      if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
      patch.status = computeOrderStatusFromPayment({ existingStatus: existing?.status, paymentStatus: patch.payment_status });
    }

    // Attempt update normally
    let { data, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    // Fallback 0: columns may not exist yet (older DB schema). Degrade gracefully.
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const missingPayment = patch.payment_status !== undefined && msg.includes("payment_status") && msg.includes("does not exist");
      const missingPrep = patch.prep_status !== undefined && msg.includes("prep_status") && msg.includes("does not exist");

      if (missingPayment || missingPrep) {
        const reduced: any = { ...patch };
        if (missingPayment) delete reduced.payment_status;
        if (missingPrep) delete reduced.prep_status;

        // If payment_status was requested but column missing, we can still mirror it into legacy status.
        if (missingPayment && patch.payment_status && reduced.status === undefined) {
          const { data: existing, error: selErr } = await supabaseAdmin.from("orders").select("status").eq("id", id).single();
          if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
          reduced.status = computeOrderStatusFromPayment({ existingStatus: existing?.status, paymentStatus: patch.payment_status });
        }

        const retry = await supabaseAdmin.from("orders").update(reduced).eq("id", id).select().single();
        data = retry.data;
        error = retry.error;
      }
    }

    // Fallback 1: if DB expects "unpaid" instead of "pending"
    if (error && patch.status === "pending") {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("enum")) {
        const retry = await supabaseAdmin
          .from("orders")
          .update({ ...patch, status: "unpaid" })
          .eq("id", id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }
    }

    // Fallback 2: admin_note column doesn't exist -> append into notes instead (keeps customer notes)
    if (error && patch.admin_note !== undefined) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("admin_note") && msg.includes("does not exist")) {
        const { data: existing, error: selErr } = await supabaseAdmin
          .from("orders")
          .select("notes,status")
          .eq("id", id)
          .single();
        if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

        const prevNotes = (existing?.notes ?? "").toString();
        const adminLine = patch.admin_note ? `\n[ADMIN] ${patch.admin_note}` : "";
        const nextNotes = (prevNotes + adminLine).trim();

        const retry = await supabaseAdmin
          .from("orders")
          .update({ ...patch, admin_note: undefined, notes: nextNotes })
          .eq("id", id)
          .select()
          .single();

        data = retry.data;
        error = retry.error;
      }
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ order: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);

    // Delete single order
    const id = url.searchParams.get("id");
    if (id) {
      const delItems = await supabaseAdmin.from("order_items").delete().eq("order_id", id);
      if (delItems.error) return NextResponse.json({ error: delItems.error.message }, { status: 500 });

      const delOrder = await supabaseAdmin.from("orders").delete().eq("id", id);
      if (delOrder.error) return NextResponse.json({ error: delOrder.error.message }, { status: 500 });

      return NextResponse.json({ ok: true, deleted: { id } });
    }

    // Purge before date
    const before = url.searchParams.get("before");
    if (before) {
      const { data: orders, error: selErr } = await supabaseAdmin
        .from("orders")
        .select("id")
        .lt("created_at", before);

      if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

      const ids = (orders ?? []).map((o: any) => o.id);
      if (ids.length === 0) return NextResponse.json({ ok: true, deletedCount: 0 });

      await supabaseAdmin.from("order_items").delete().in("order_id", ids);
      await supabaseAdmin.from("orders").delete().in("id", ids);

      return NextResponse.json({ ok: true, deletedCount: ids.length, before });
    }

    return NextResponse.json({ error: "Provide ?id=ORDER_ID or ?before=ISO_DATE" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
