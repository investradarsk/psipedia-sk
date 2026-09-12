import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createAdminDogReport, type ManagedDogReportInput } from "@/lib/lost-found-dog-store";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const input = await request.json() as ManagedDogReportInput;
    const report = await createAdminDogReport(input, user.email);
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hlásenie sa nepodarilo vytvoriť." }, { status: 400 });
  }
}
