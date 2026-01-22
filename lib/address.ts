// lib/address.ts

export function normalizeCanadianPostal(input: string): string {
  const s = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  // Canadian postal is 6 chars: A1A1A1
  if (s.length <= 3) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)}`.trim();
}

export function isValidCanadianPostal(input: string): boolean {
  const s = normalizeCanadianPostal(input).replace(/\s/g, "");
  // Very standard Canadian postal format (excludes some letters in first position)
  // A1A 1A1
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(s);
}

export function formatAddress(parts: {
  street: string;
  unit?: string;
  city: string;
  postal: string;
}): string {
  const street = String(parts.street || "").trim();
  const unit = String(parts.unit || "").trim();
  const city = String(parts.city || "").trim();
  const postal = normalizeCanadianPostal(parts.postal || "");

  const line1 = unit ? `${street}, ${unit}` : street;
  const line2 = [city, postal].filter(Boolean).join(", ");

  return [line1, line2].filter(Boolean).join("\n");
}

/**
 * Back-compat parser for old single-string address field.
 * Tries to split into: street, unit, city, postal.
 * This is best-effort (old data is messy).
 */
export function parseLegacyAddress(address: string): {
  street: string;
  unit: string;
  city: string;
  postal: string;
} {
  const raw = String(address || "").trim();
  if (!raw) return { street: "", unit: "", city: "", postal: "" };

  // Normalize separators
  const cleaned = raw.replace(/\r/g, "").replace(/\n+/g, ", ").replace(/\s+/g, " ").trim();

  // Try to find postal code anywhere
  const postalMatch = cleaned.match(
    /([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)/i
  );

  let postal = "";
  let withoutPostal = cleaned;

  if (postalMatch) {
    postal = normalizeCanadianPostal(`${postalMatch[1]}${postalMatch[2]}`);
    withoutPostal = cleaned.replace(postalMatch[0], "").replace(/,\s*,/g, ",").trim();
  }

  // Split remaining by commas
  const parts = withoutPostal.split(",").map((p) => p.trim()).filter(Boolean);

  // Heuristic:
  // - last chunk often city
  // - first chunk often street
  // - middle chunk might be unit
  let street = parts[0] || "";
  let city = parts.length >= 2 ? parts[parts.length - 1] : "";
  let unit = parts.length >= 3 ? parts.slice(1, -1).join(", ") : "";

  // Another heuristic: if street contains "apt/unit/#"
  const unitInline = street.match(/\b(apt|apartment|unit|#)\s*([A-Za-z0-9-]+)/i);
  if (unitInline && !unit) {
    unit = unitInline[0];
    street = street.replace(unitInline[0], "").replace(/,\s*$/, "").trim();
  }

  return { street, unit, city, postal };
}
