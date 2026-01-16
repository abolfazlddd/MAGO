import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

export async function PUT(req: Request) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const sale_status = body.sale_status;

    if (sale_status !== "open" && sale_status !== "closed") {
      return NextResponse.json(
        { error: "sale_status must be 'open' or 'closed'" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("settings")
      .upsert({ key: "sale_status", value: sale_status }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sale_status });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
