import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RpcConsumeReservationRow = {
  order_id: string;
  order_month: string;
  order_number: number;
  subtotal_cents: number;
};

function formatPublicOrderId(orderMonth: string, orderNumber: number) {
  return `ORD-${orderMonth}-${String(orderNumber).padStart(4, "0")}`;
}

function mapRpcErrorToHttp(errMsg: string): { status: number; message: string } {
  const msg = errMsg || "Unknown error";

  if (msg.includes("ORDERING_CLOSED")) return { status: 403, message: "Ordering is currently closed." };
  if (msg.includes("RESERVATION_EXPIRED"))
    return { status: 409, message: "Your 8-minute hold expired. Please refresh checkout." };
  if (msg.includes("RESERVATION_NOT_ACTIVE"))
    return { status: 409, message: "This reservation is no longer active. Please refresh checkout." };
  if (msg.includes("RESERVATION_NOT_FOUND"))
    return { status: 404, message: "Reservation not found. Please refresh checkout." };
  if (msg.includes("RESERVATION_TOKEN_MISMATCH"))
    return { status: 403, message: "Reservation token mismatch. Please refresh checkout." };

  if (msg.includes("MISSING_FIELD")) return { status: 400, message: "Missing required customer fields." };

  return { status: 500, message: msg };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const customer = body?.customer ?? {};
    

    const name = String(customer?.name ?? "").trim();
    const phone = String(customer?.phone ?? "").trim();
    const address = String(customer?.address ?? "").trim();
    const notes = String(customer?.notes ?? "").trim();
    const customerConfirmedEtransfer = Boolean(customer?.customer_confirmed_etransfer ?? false);
    

    const reservationId = String(body?.reservationId ?? "").trim();
    const token = String(body?.token ?? "").trim();

    if (!reservationId || !token) {
      return NextResponse.json({ error: "Missing reservation info. Please refresh checkout." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .rpc("consume_reservation", {
  p_reservation_id: reservationId,
  p_token: token,
  p_customer_name: name,
  p_customer_phone: phone,
  p_customer_address: address,
  p_notes: notes,
  p_customer_confirmed_etransfer: customerConfirmedEtransfer,
})
      .single();

    if (error) {
      const mapped = mapRpcErrorToHttp(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    // ✅ Fix: explicitly type the RPC row
    const row = data as unknown as RpcConsumeReservationRow;

    if (!row?.order_id || !row?.order_month || typeof row?.order_number !== "number") {
      return NextResponse.json({ error: "Order failed (invalid response)." }, { status: 500 });
    }

    const publicOrderId = formatPublicOrderId(row.order_month, row.order_number);

    const etransferEmail = process.env.ETRANSFER_EMAIL || "";
    const etransferName = process.env.ETRANSFER_NAME || "";
    const dollars = (Number(row.subtotal_cents ?? 0) / 100).toFixed(2);

    return NextResponse.json({
      orderId: row.order_id,
      publicOrderId,
      orderMonth: row.order_month,
      orderNumber: row.order_number,
      etransfer: {
        email: etransferEmail,
        message: `Order ${publicOrderId} - $${dollars} - ${name}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
