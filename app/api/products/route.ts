import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabasePublic
    .from("products")
    .select("id,name,description,price_cents,stock_on_hand,track_stock,image_url,is_active")
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    __debug: "products_route_with_track_stock_v1",
    products: data ?? [],
  });
}
