import { getAdminApiUser, unauthorizedAdminResponse } from "./admin-auth";

export async function requireAutomationAdminMutation(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return { response: unauthorizedAdminResponse(), user: null };

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return { response: Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 }), user: null };
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { response: Response.json({ error: "Vyžaduje sa application/json." }, { status: 415 }), user: null };
  }
  return { response: null, user };
}
