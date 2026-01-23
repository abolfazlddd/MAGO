// lib/adminImage.ts
export type ResolveImageStrategy = "exclusive" | "prefer-file";

type ResolveArgs = {
  file: File | null;
  url: string | null | undefined;
  /** Upload should return a public URL (string) or null if upload failed. */
  upload: (file: File) => Promise<string | null>;
  strategy?: ResolveImageStrategy;
};

/**
 * Resolve a final image_url for a product, from either:
 *  - a local File (uploaded via /api/admin/upload-image), or
 *  - a direct URL string.
 *
 * Strategies:
 *  - "exclusive": if both provided => throw (forces user to pick one)
 *  - "prefer-file": file wins if provided (useful when editing an existing product)
 */
export async function resolveProductImageUrl(args: ResolveArgs): Promise<string | null> {
  const strategy: ResolveImageStrategy = args.strategy ?? "exclusive";
  const url = (args.url ?? "").trim();
  const file = args.file;

  if (strategy === "exclusive" && file && url) {
    throw new Error("Choose either an image upload OR an image URL (not both).");
  }

  if (file) {
    const uploaded = await args.upload(file);
    return uploaded ? uploaded.trim() : null;
  }

  return url ? url : null;
}
