import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function mapRpcError(errMsg: string) {
  const msg = errMsg || "Unknown error";
  if (msg.includes("RESERVATION_TOKEN_MISMATCH")) return { status: 403, message: "Reservation token mismatch." };
  return { status: 500, message: msg };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const reservationId = String(body?.reservationId ?? "").trim();
    const token = String(body?.token ?? "").trim();

    if (!reservationId || !token) {
      // idempotent: treat missing as success so navigation doesn't break
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabaseAdmin.rpc("cancel_reservation", {
      p_reservation_id: reservationId,
      p_token: token,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
