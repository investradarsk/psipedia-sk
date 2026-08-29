const CANONICAL_ALTHEA_PATH = "/adresar/veterinari/veterinarna-poliklinika-althea";

export function GET(request: Request) {
  return Response.redirect(new URL(CANONICAL_ALTHEA_PATH, request.url), 301);
}
