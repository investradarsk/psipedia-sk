import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listDynamicPublicUrls } from "@/lib/visual-library-dynamic-urls";
import { isDynamicUrlKind } from "@/lib/visual-library-dynamic-urls-contract";

export const dynamic = "force-dynamic";

/** Authenticated, read-only public URL index. No admin/private fields or write path. */
export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    const rawPage = params.get("page") ?? "1";
    const rawQuery = params.get("q") ?? "";
    if (!isDynamicUrlKind(kind) || !/^[1-9][0-9]{0,5}$/.test(rawPage) || rawQuery.length > 100) {
      return Response.json({error:"Neplatný typ, stránka alebo hľadaný text."},{
        status:400, headers:{"Cache-Control":"private, no-store"}});
    }
    const result = await listDynamicPublicUrls({kind,page:Number(rawPage),q:rawQuery});
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    console.error("visual_library_dynamic_url_scan_failed",error);
    return Response.json({error:"Evidencia URL nie je dostupná alebo nie je úplná. Neskúšaj odhadovať adresy."},{
      status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
