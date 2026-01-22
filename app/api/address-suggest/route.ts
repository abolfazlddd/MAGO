import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure node runtime (fetch works fine)

type Suggestion = {
  display: string;
  street: string;
  city: string;
  postal: string;
};

function pickCity(addr: any): string {
  return (
    addr?.city ||
    addr?.town ||
    addr?.village ||
    addr?.hamlet ||
    addr?.municipality ||
    addr?.county ||
    ""
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();

  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] satisfies Suggestion[] });
  }

  // Nominatim usage policy prefers a contact header.
  const url =
  `https://nominatim.openstreetmap.org/search?` +
  new URLSearchParams({
    q: q,                      // raw user input
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",

    // 🇨🇦 Restrict to Canada
    countrycodes: "ca",

    // 🎯 Hard bias to Ontario bounding box
    // (SW corner -> NE corner)
    viewbox: "-95.1561,41.6766,-74.3206,56.9314",
    bounded: "1",

    // Prefer street-level addresses
    extratags: "1",
  });

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "charity-shop/1.0 (address autocomplete)",
        "accept-language": "en-CA,en;q=0.9",
      },
      // Cache lightly to avoid hammering the service
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data: any[] = await res.json();

    const suggestions: Suggestion[] = (data || [])
      .map((r) => {
        const addr = r.address || {};
        const house = addr.house_number ? String(addr.house_number).trim() : "";
        const road = addr.road ? String(addr.road).trim() : "";
        const street = [house, road].filter(Boolean).join(" ").trim();

        const city = pickCity(addr);
        const postal = addr.postcode ? String(addr.postcode).trim().toUpperCase() : "";

        const display = r.display_name ? String(r.display_name) : [street, city, postal].filter(Boolean).join(", ");

        return {
          display,
          street: street || "",
          city: city || "",
          postal: postal || "",
        };
      })
      // only keep entries that at least have street+city
      .filter((s) => (s.street && s.city) || s.display);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
