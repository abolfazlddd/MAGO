import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs"; // important for file handling

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  // Optional: require admin auth for uploads
  // If you don’t want this, delete this block.
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field 'file' in form-data" }, { status: 400 });
  }

  // Basic limits (optional but smart)
  const maxBytes = 5 * 1024 * 1024; // 5MB
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeExt = ext || "jpg";
  const path = `products/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("product-images")
    .upload(path, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Public URL (bucket must be Public)
  const { data: publicData } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);

  const url = publicData?.publicUrl;
  if (!url) return NextResponse.json({ error: "Failed to get public URL" }, { status: 500 });

  return NextResponse.json({ url });
}
