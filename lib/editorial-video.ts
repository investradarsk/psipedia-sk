export const EDITORIAL_VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;

export type EditorialVideoProvider = (typeof EDITORIAL_VIDEO_PROVIDERS)[number];

export type EditorialExternalVideo = {
  kind: "external-video";
  provider: EditorialVideoProvider;
  sourceUrl: string;
  embedUrl: string;
  videoId: string;
  title?: string;
  caption?: string;
};

function safeText(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function youtubeId(url: URL) {
  const host = url.hostname.toLowerCase();
  const allowedHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
  if (!allowedHosts.has(host)) return null;

  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? "";
  }
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

function vimeoId(url: URL) {
  const host = url.hostname.toLowerCase();
  if (!["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts.at(-1) ?? "";
  return /^\d{5,20}$/.test(id) ? id : null;
}

export function normalizeEditorialExternalVideo(input: {
  url?: unknown;
  title?: unknown;
  caption?: unknown;
}): EditorialExternalVideo | null {
  const source = safeText(input.url);
  if (!source) return null;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const youtube = youtubeId(url);
  if (youtube) {
    return {
      kind: "external-video",
      provider: "youtube",
      sourceUrl: url.toString(),
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}`,
      videoId: youtube,
      title: safeText(input.title, 500) || undefined,
      caption: safeText(input.caption, 1_000) || undefined,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      kind: "external-video",
      provider: "vimeo",
      sourceUrl: url.toString(),
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      videoId: vimeo,
      title: safeText(input.title, 500) || undefined,
      caption: safeText(input.caption, 1_000) || undefined,
    };
  }

  return null;
}

export function isAllowedEditorialVideoUrl(value: unknown) {
  return Boolean(normalizeEditorialExternalVideo({ url: value }));
}
