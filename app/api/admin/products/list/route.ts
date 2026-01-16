import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,name,description,price_cents,stock_on_hand,track_stock,image_url,is_active")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}
