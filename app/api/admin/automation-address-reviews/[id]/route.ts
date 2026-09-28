import { requireAdminMutation } from "@/lib/admin-auth";
import {
  dismissAutomationAddressReviewCase,
  getAutomationAddressReviewCase,
} from "@/lib/data-automation-address-review-store";
import {
  AutomationAddressReviewError,
  resolveAutomationAddressReview,
} from "@/lib/data-automation-address-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function numericId(params: Props["params"]) {
  const id = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });
  }
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID kontroly." }, { status: 400 });

  try {
    const body = await request.json() as {
      action?: unknown;
      candidateHash?: unknown;
      expectedFingerprint?: unknown;
    };
    if (body.action === "resolve") {
      const candidateHash = typeof body.candidateHash === "string" ? body.candidateHash.trim() : "";
      if (!candidateHash) {
        return Response.json({ error: "Vyber adresu, ktorú chceš potvrdiť." }, { status: 400 });
      }
      const result = await resolveAutomationAddressReview({
        id,
        candidateHash,
        actorRef: auth.user.email,
      });
      return Response.json({ ok: true, ...result });
    }
    if (body.action === "dismiss") {
      const expectedFingerprint = typeof body.expectedFingerprint === "string"
        ? body.expectedFingerprint.trim()
        : "";
      if (!expectedFingerprint) {
        return Response.json({ error: "Kontrola sa medzitým zmenila. Obnov stránku." }, { status: 409 });
      }
      const current = await getAutomationAddressReviewCase(id);
      if (!current) return Response.json({ error: "Kontrola adresy sa nenašla." }, { status: 404 });
      if (current.status !== "OPEN" || current.fingerprint !== expectedFingerprint) {
        return Response.json({ error: "Kontrola sa medzitým zmenila. Obnov stránku." }, { status: 409 });
      }
      const review = await dismissAutomationAddressReviewCase({
        id,
        actorRef: auth.user.email,
        expectedFingerprint,
      });
      if (!review || review.status !== "DISMISSED") {
        return Response.json({ error: "Kontrolu sa nepodarilo bezpečne uzavrieť." }, { status: 409 });
      }
      return Response.json({ ok: true, review });
    }
    return Response.json({ error: "Nepodporovaná akcia." }, { status: 400 });
  } catch (error) {
    if (error instanceof AutomationAddressReviewError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({
      error: error instanceof Error ? error.message : "Adresnú kontrolu sa nepodarilo spracovať.",
    }, { status: 500 });
  }
}
