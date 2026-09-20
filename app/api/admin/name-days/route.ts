import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  createDogNameDayRecord,
  isDogNameDayConflict,
  listDogNameDayRecords,
  type DogNameDayInput,
} from "@/lib/dog-name-day-store";
import type { DogNameDayStatus } from "@/lib/dog-name-days";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const conflict = isDogNameDayConflict(error);
  return Response.json({
    error: conflict ? "Toto meno už pre rovnaký deň existuje." : error instanceof Error ? error.message : "Záznam sa nepodarilo uložiť.",
  }, { status: conflict ? 409 : 400 });
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const url = new URL(request.url);
  const rawMonth = Number.parseInt(url.searchParams.get("month") ?? "", 10);
  const rawStatus = url.searchParams.get("status") ?? "all";
  const status: DogNameDayStatus | "all" = ["draft", "published", "archived"].includes(rawStatus)
    ? rawStatus as DogNameDayStatus
    : "all";
  try {
    const records = await listDogNameDayRecords({
      query: url.searchParams.get("q") ?? "",
      month: Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : null,
      status,
    });
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kalendár sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const record = await createDogNameDayRecord(await request.json() as DogNameDayInput, user.email);
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
