import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { autocompleteDirectoryAddress } from "@/lib/directory-address-provider";
import { GeocoderProviderError } from "@/lib/geo-provider";

export const dynamic = "force-dynamic";

function providerError(error: unknown) {
  if (error instanceof GeocoderProviderError) {
    const status = error.code === "RATE_LIMITED" ? 429
      : error.code === "DISABLED" || error.code === "PROVIDER_ERROR" ? 503
        : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Adresu sa nepodarilo vyhľadať." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const region = url.searchParams.get("region") ?? "";
  const district = url.searchParams.get("district") ?? "";
  const city = url.searchParams.get("city") ?? "";
  const query = url.searchParams.get("q") ?? "";

  try {
    const suggestions = await autocompleteDirectoryAddress({ region, district, city, query });
    return Response.json({ suggestions }, {
      headers: { "cache-control": "private, max-age=30" },
    });
  } catch (error) {
    return providerError(error);
  }
}
