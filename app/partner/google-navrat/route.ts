import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const target = normalizePartnerReturnTo(url.searchParams.get("to")) ?? "/partner";

  return new Response(null, {
    status: 303,
    headers: {
      Location: target,
      "Cache-Control": "private, no-store",
    },
  });
}
