import { requireAdminMutation, unauthorizedAdminResponse } from "./admin-auth";

/** Partner-management Admin mutations use the same authentication and CSRF policy as other Admin writes. */
export async function requirePartnerAdminMutation(request: Request) {
  const authorization = await requireAdminMutation(request);
  if (authorization.response) return { response: authorization.response };
  if (!authorization.user) return { response: unauthorizedAdminResponse() };
  return { user: authorization.user };
}
