import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabasePublic
    .from("settings")
    .select("value")
    .eq("key", "sale_status")
    .single();

  // default to open if missing/error
  if (error || !data?.value) {
    return NextResponse.json({ sale_status: "open" });
  }

  return NextResponse.json({
    sale_status: data.value === "closed" ? "closed" : "open",
  });
}