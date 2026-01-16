import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Basic safety: allow only images
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  // Optional: size limit (e.g., 5MB)
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 400 });
  }

  const bucket = "product-images";
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Public URL (because bucket is public)
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);

  return NextResponse.json({ url: data.publicUrl });
}
