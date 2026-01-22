import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { HOLD_MINUTES } from "@/lib/hold";

type RpcReserveCartRow = {
  reservation_id: string;
  expires_at: string; // timestamptz comes back as string
  subtotal_cents: number;
};

function normalizeItems(raw: any): { product_id: string; qty: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => ({
      product_id: String(i?.productId ?? "").trim(),
      qty: Number(i?.qty ?? 0),
    }))
    .filter((i) => i.product_id && Number.isFinite(i.qty) && i.qty > 0);
}

function mapRpcError(errMsg: string) {
  const msg = errMsg || "Unknown error";
  if (msg.includes("ORDERING_CLOSED")) return { status: 403, message: "Ordering is currently closed." };
  if (msg.includes("INSUFFICIENT_STOCK")) {
    const productName = msg.split(":").slice(1).join(":").trim() || "this item";
    return { status: 409, message: `Not enough stock for "${productName}".` };
  }
  if (msg.includes("PRODUCT_NOT_AVAILABLE")) {
    const productName = msg.split(":").slice(1).join(":").trim() || "this item";
    return { status: 400, message: `Product is not available: ${productName}.` };
  }
  if (msg.includes("CART_EMPTY")) return { status: 400, message: "Cart is empty." };
  return { status: 500, message: msg };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const items = normalizeItems(body?.items);

    if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: "Cart is empty." }, { status: 400 });

    const holdMinutes = HOLD_MINUTES;

    const { data, error } = await supabaseAdmin
      .rpc("reserve_cart", {
        p_token: token,
        p_items: items,
        p_hold_minutes: holdMinutes,
      })
      .single();

    if (error) {
      const mapped = mapRpcError(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    // ✅ Fix: explicitly type the RPC row
    const row = data as unknown as RpcReserveCartRow;

    if (!row?.reservation_id || !row?.expires_at) {
      return NextResponse.json({ error: "Reservation failed (invalid response)." }, { status: 500 });
    }

    return NextResponse.json({
      reservationId: row.reservation_id,
      expiresAt: row.expires_at,
      subtotalCents: Number(row.subtotal_cents ?? 0),
      holdMinutes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
