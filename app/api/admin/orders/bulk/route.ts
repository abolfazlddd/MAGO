import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/adminAuth";
import { normalizeOrderStatus, normalizePaymentStatus, normalizePrepStatus, computeOrderStatusFromPayment } from "@/lib/orderAdmin";

function checkAuth(req: Request) {
  return isAdminAuthorized(req);
}

/**
 * POST /api/admin/orders/bulk
 * Body:
 *   {
 *     ids: string[],
 *     patch: {
 *       payment_status?: "paid"|"unpaid",
 *       prep_status?: "ready"|"not_ready",
 *       status?: "fulfilled"|"cancelled"|"paid"|"pending"|"unpaid"
 *     }
 *   }
 */
export async function POST(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const ids = body?.ids;
    const patchIn = body?.patch ?? {};

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string" && x.trim())) {
      return NextResponse.json({ error: "ids must be a non-empty string array" }, { status: 400 });
    }

    const norm: any = {};
    if (patchIn.payment_status !== undefined) {
      const n = normalizePaymentStatus(patchIn.payment_status);
      if (!n) return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 });
      norm.payment_status = n;
    }
    if (patchIn.prep_status !== undefined) {
      const n = normalizePrepStatus(patchIn.prep_status);
      if (!n) return NextResponse.json({ error: "Invalid prep_status" }, { status: 400 });
      norm.prep_status = n;
    }
    if (patchIn.status !== undefined) {
      const n = normalizeOrderStatus(patchIn.status);
      if (!n) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      norm.status = n;
    }

    if (Object.keys(norm).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // We need existing statuses to respect terminal dominance when mirroring payment_status -> status
    const { data: existingRows, error: selErr } = await supabaseAdmin
      .from("orders")
      .select("id,status")
      .in("id", ids);

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
    const existingById = new Map<string, any>((existingRows ?? []).map((r: any) => [r.id, r]));

    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];

    // Pragmatic: loop updates to keep logic simple + deterministic.
    for (const id of ids) {
      const existing = existingById.get(id);
      if (!existing) {
        errors.push({ id, error: "Order not found" });
        continue;
      }

      const patch: any = { ...norm };

      // If changing payment_status without explicit status, mirror into legacy status.
      if (patch.payment_status && patch.status === undefined) {
        patch.status = computeOrderStatusFromPayment({ existingStatus: existing.status, paymentStatus: patch.payment_status });
      }

      const { error: updErr } = await supabaseAdmin.from("orders").update(patch).eq("id", id);
      if (updErr) {
        // Degrade gracefully if new columns don't exist yet
        const msg = String(updErr.message || "").toLowerCase();
        const reduced: any = { ...patch };
        const missingPayment = reduced.payment_status !== undefined && msg.includes("payment_status") && msg.includes("does not exist");
        const missingPrep = reduced.prep_status !== undefined && msg.includes("prep_status") && msg.includes("does not exist");
        if (missingPayment) delete reduced.payment_status;
        if (missingPrep) delete reduced.prep_status;
        if (missingPayment && patch.payment_status && reduced.status === undefined) {
          reduced.status = computeOrderStatusFromPayment({ existingStatus: existing.status, paymentStatus: patch.payment_status });
        }

        const retry = await supabaseAdmin.from("orders").update(reduced).eq("id", id);
        if (retry.error) {
          errors.push({ id, error: retry.error.message });
          continue;
        }
      }

      updated += 1;
    }

    return NextResponse.json({ ok: true, updated, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
