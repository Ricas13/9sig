import { ImageResponse } from "next/og";

// App icons drawn on demand, so there are no binary files to keep in sync. "maskable-512" leaves the
// safe zone Android needs when it crops the icon into a circle or squircle.
const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true }
};

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const { size } = await context.params;
  const spec = SIZES[size];
  if (!spec) return new Response("Not found", { status: 404 });
  const mark = Math.round(spec.px * (spec.maskable ? 0.4 : 0.56));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#07111f", borderRadius: spec.maskable ? 0 : Math.round(spec.px * 0.22) }}>
      <div style={{ width: mark, height: mark, borderRadius: "50%", background: "linear-gradient(135deg,#78f3c6,#4aa8ff)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: Math.round(mark * 0.46), height: Math.round(mark * 0.46), borderRadius: "50%", background: "#07111f" }} />
      </div>
    </div>,
    { width: spec.px, height: spec.px, headers: { "cache-control": "public, max-age=86400" } }
  );
}
