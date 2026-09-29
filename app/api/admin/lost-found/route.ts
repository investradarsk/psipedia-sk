import { requireAdminMutation } from "@/lib/admin-auth";
import { createAdminDogReport, type ManagedDogReportInput } from "@/lib/lost-found-dog-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;
  try {
    const input = await request.json() as ManagedDogReportInput;
    const report = await createAdminDogReport(input, auth.user.email);
    return Response.json(
      { report },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Hlásenie sa nepodarilo vytvoriť." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
