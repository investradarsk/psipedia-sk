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
};

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

function isConfiguredAdmin(user: ChatGPTUser) {
  return configuredAdminEmails().has(user.email.trim().toLowerCase());
}

export async function requireAdminPageUser(returnTo: string) {
  if (await isTrustedAgentPreview()) return PREVIEW_USER;
  const user = await requireChatGPTUser(returnTo);
  if (!isConfiguredAdmin(user)) redirect("/admin/nepovoleny");
  return user;
}

export async function getAdminApiUser() {
  if (await isTrustedAgentPreview()) return PREVIEW_USER;
  const user = await getChatGPTUser();
  return user && isConfiguredAdmin(user) ? user : null;
}

export function unauthorizedAdminResponse() {
  return Response.json(
    { error: "Na túto operáciu nemáš oprávnenie." },
    { status: 401 },
  );
}
