import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === process.env.ADMIN_PASSWORD;
}

function toNumberMaybe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * POST /api/admin/products
 * Create a new product
 */
export async function POST(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const {
      name,
      description = "",
      price_cents,
      stock_on_hand = 0,
      track_stock = true,
      image_url = "",
      is_active = true,
    } = body ?? {};

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const price = toNumberMaybe(price_cents) ?? 0;
    const stock = toNumberMaybe(stock_on_hand) ?? 0;
    const track = track_stock === false ? false : true;

    const insert = {
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      price_cents: price,
      track_stock: track,
      stock_on_hand: track ? stock : 0,
      image_url: typeof image_url === "string" ? image_url : "",
      is_active: typeof is_active === "boolean" ? is_active : true,
    };

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert(insert)
      .select("id,name,description,price_cents,stock_on_hand,track_stock,image_url,is_active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/products
 * Update a product
 * Body: { id, name?, description?, price_cents?, stock_on_hand?, track_stock?, image_url?, is_active? }
 */
export async function PUT(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, name, description, price_cents, stock_on_hand, track_stock, image_url, is_active } = body ?? {};

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const patch: any = {};

    if (typeof name === "string") patch.name = name.trim();
    if (typeof description === "string") patch.description = description.trim();
    if (typeof image_url === "string") patch.image_url = image_url;
    if (typeof is_active === "boolean") patch.is_active = is_active;

    const price = toNumberMaybe(price_cents);
    if (price !== null) patch.price_cents = price;

    // track_stock logic
    if (typeof track_stock === "boolean") {
      patch.track_stock = track_stock;
      if (track_stock === false) patch.stock_on_hand = 0; // unlimited => store 0
    }

    // stock update only when tracking is ON (or unknown, default ON)
    const stock = toNumberMaybe(stock_on_hand);
    const trackingIsOff = patch.track_stock === false;
    if (stock !== null && !trackingIsOff) {
      patch.stock_on_hand = stock;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(patch)
      .eq("id", id)
      .select("id,name,description,price_cents,stock_on_hand,track_stock,image_url,is_active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/products?id=...
 * HARD DELETE
 */
export async function DELETE(req: Request) {
  try {
    if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", id)
      .select("id,name")
      .single();

    if (error) {
      const msg = String(error.message || "");
      const fkHint = msg.toLowerCase().includes("foreign key") || msg.toLowerCase().includes("constraint");

      return NextResponse.json(
        {
          error: fkHint
            ? "Cannot hard-delete because it is referenced by existing orders. (Check that order_items.product_id FK is ON DELETE SET NULL.)"
            : msg,
        },
        { status: fkHint ? 409 : 500 }
      );
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
