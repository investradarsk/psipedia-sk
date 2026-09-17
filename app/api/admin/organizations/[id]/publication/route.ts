import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  changeOrganizationPublicationFromAdmin,
  isOrganizationPublicationConflict,
  OrganizationPublicationBlockedError,
  type OrganizationPublicationAction,
} from "@/lib/help-organization-admin-write";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";

type RouteContext = { params: Promise<{ id: string }> };
type PublicationRuntimeEnv = { CF_VERSION_METADATA?: { id?: string } };

type PublicationRequest = {
  action?: unknown;
  expectedUpdatedAt?: unknown;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Neplatné ID organizácie." }, { status: 400 });

  let body: PublicationRequest;
  try {
    body = await request.json() as PublicationRequest;
  } catch {
    return NextResponse.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }

  const action = body.action === "publish" || body.action === "unpublish"
    ? body.action as OrganizationPublicationAction
    : null;
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!action || !expectedUpdatedAt.trim()) {
    return NextResponse.json({ error: "Chýba publication action alebo expectedUpdatedAt." }, { status: 400 });
  }

  try {
    const item = await changeOrganizationPublicationFromAdmin(id, action, user.email, expectedUpdatedAt);
    if (!item) return NextResponse.json({ error: "Organizácia neexistuje." }, { status: 404 });

    const workerVersionId = (env as unknown as PublicationRuntimeEnv).CF_VERSION_METADATA?.id;
    const publicProfileUrl = new URL(`/organizacie/${item.slug}`, request.url);
    await invalidateVersionedPublicHtmlCacheUrl(publicProfileUrl, workerVersionId);

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof OrganizationPublicationBlockedError) {
      return NextResponse.json({ error: error.message, preflight: error.preflight }, { status: 409 });
    }
    if (isOrganizationPublicationConflict(error)) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Publication konflikt." }, { status: 409 });
    }
    console.error("Organization publication mutation failed", error);
    return NextResponse.json({ error: "Publication zmenu sa nepodarilo uložiť." }, { status: 500 });
  }
}
