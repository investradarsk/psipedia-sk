import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  disableAdminPushSubscription,
  getAdminPushSubscriptionState,
  registerAdminPushSubscription,
} from "@/lib/admin-push";

export const dynamic = "force-dynamic";

function validJsonRequest(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin
    && request.headers.get("content-type")?.toLowerCase().includes("application/json");
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!validJsonRequest(request)) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action?: unknown;
      endpoint?: unknown;
      p256dh?: unknown;
      auth?: unknown;
      label?: unknown;
      platform?: unknown;
    };
    if (body.action === "status") {
      if (typeof body.endpoint !== "string") {
        return Response.json({ error: "Chýba endpoint zariadenia." }, { status: 400 });
      }
      return Response.json(await getAdminPushSubscriptionState(user.email, body.endpoint));
    }
    if (body.action !== "enable") {
      return Response.json({ error: "Neplatná push akcia." }, { status: 400 });
    }
    if (typeof body.endpoint !== "string" || typeof body.p256dh !== "string" || typeof body.auth !== "string") {
      return Response.json({ error: "Push subscription nie je kompletná." }, { status: 400 });
    }
    const result = await registerAdminPushSubscription(user.email, {
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      label: typeof body.label === "string" ? body.label : undefined,
      platform: typeof body.platform === "string" ? body.platform : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Push subscription sa nepodarilo uložiť." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!validJsonRequest(request)) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  try {
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string") {
      return Response.json({ error: "Chýba endpoint zariadenia." }, { status: 400 });
    }
    return Response.json(await disableAdminPushSubscription(user.email, body.endpoint));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Push subscription sa nepodarilo vypnúť." },
      { status: 400 },
    );
  }
}
