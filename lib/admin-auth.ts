import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getChatGPTUser,
  requireChatGPTUser,
  type ChatGPTUser,
} from "@/app/chatgpt-auth";

type AdminRuntimeEnv = {
  ADMIN_EMAILS?: string;
  AUTH_MODE?: string;
};

const ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion";
const ADMIN_AUTHORIZED_HEADER = "x-psipedia-admin-authorized";

const PREVIEW_USER: ChatGPTUser = {
  authProvider: "chatgpt",
  displayName: "Martin – pracovný náhľad",
  email: "preview@psipedia.local",
  fullName: "Martin",
};

async function isTrustedAgentPreview() {
  if (process.env.NODE_ENV === "production") return false;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.toLowerCase() ?? "";
  return host === "terminal.local:4173" || host.startsWith("localhost:");
}

function configuredAdminEmails() {
  const runtimeEnv = env as unknown as AdminRuntimeEnv;
  return new Set(
    (runtimeEnv.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function usesCloudflareAccess() {
  const runtimeEnv = env as unknown as AdminRuntimeEnv;
  return runtimeEnv.AUTH_MODE === "cloudflare-access";
}

async function getCloudflareAccessUser(): Promise<ChatGPTUser | null> {
  if (!usesCloudflareAccess()) return null;

  const requestHeaders = await headers();
  const assertion = requestHeaders.get(ACCESS_ASSERTION_HEADER);
  const authorized = requestHeaders.get(ADMIN_AUTHORIZED_HEADER) === "1";
  const user = await getChatGPTUser();

  // Cloudflare Access applies the application's allow policy first. The Worker
  // then validates the JWT and injects both the verified identity and this
  // internal authorization marker. Requiring all three prevents client-supplied
  // identity headers from being treated as an authenticated administrator.
  return assertion && authorized && user?.authProvider === "cloudflare-access" ? user : null;
}

function isConfiguredAdmin(user: ChatGPTUser) {
  return configuredAdminEmails().has(user.email.trim().toLowerCase());
}

export async function requireAdminPageUser(returnTo: string) {
  if (await isTrustedAgentPreview()) return PREVIEW_USER;

  if (usesCloudflareAccess()) {
    const user = await getCloudflareAccessUser();
    if (!user) redirect("/admin/nepovoleny");
    return user;
  }

  const user = await requireChatGPTUser(returnTo);
  if (!isConfiguredAdmin(user)) redirect("/admin/nepovoleny");
  return user;
}

export async function getAdminApiUser() {
  if (await isTrustedAgentPreview()) return PREVIEW_USER;

  if (usesCloudflareAccess()) {
    return getCloudflareAccessUser();
  }

  const user = await getChatGPTUser();
  return user && isConfiguredAdmin(user) ? user : null;
}

export function unauthorizedAdminResponse() {
  return Response.json(
    { error: "Na túto operáciu nemáš oprávnenie." },
    { status: 401 },
  );
}
