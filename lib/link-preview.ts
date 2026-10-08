/**
 * A link found in a task's text, reduced to what a card can draw.
 *
 * Open Graph metadata cannot be fetched from the browser (the cross-origin
 * request is blocked), and this app is a static export with no server to proxy
 * through, so the preview is derived from the URL itself. Hosts whose
 * thumbnail URL is derivable get an image; everything else falls back to the
 * domain, which is the documented behaviour when metadata is unavailable.
 */
export interface LinkPreview {
  url: string;
  /** `youtube.com`, with any `www.` removed. */
  domain: string;
  /** A friendly name when the host is recognised, e.g. `YouTube`. */
  siteName: string | null;
  /** Only set when derivable from the URL with no request. */
  thumbnailUrl: string | null;
}

const SITE_NAMES: Record<string, string> = {
  "youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "github.com": "GitHub",
  "figma.com": "Figma",
  "notion.so": "Notion",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "tiktok.com": "TikTok",
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "x.com": "X",
  "twitter.com": "X",
  "linkedin.com": "LinkedIn",
};

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;

function thumbnailFor(url: URL, domain: string): string | null {
  let videoId: string | null = null;
  if (domain === "youtube.com" || domain === "m.youtube.com") {
    videoId = url.searchParams.get("v");
  } else if (domain === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  }
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Builds a preview for one URL, or null if it cannot be parsed.
 *
 * This never throws: a malformed URL in a description must not stop the card
 * from rendering.
 */
export function previewForUrl(raw: string): LinkPreview | null {
  const trimmed = raw.replace(/[.,;:)\]]+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // `http://` parses but has no host, and a bare phrase is not a link.
  if (!url.hostname) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const domain = url.hostname.replace(/^www\./, "");
  return {
    url: trimmed,
    domain,
    siteName: SITE_NAMES[domain] ?? null,
    thumbnailUrl: thumbnailFor(url, domain),
  };
}

/** The first http(s) link in `text`, or null. */
export function firstLinkIn(text: string): LinkPreview | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  for (const candidate of match) {
    const preview = previewForUrl(candidate);
    if (preview) return preview;
  }
  return null;
}

/** Every distinct http(s) link in `text`, in order. */
export function allLinksIn(text: string): LinkPreview[] {
  const seen = new Set<string>();
  const out: LinkPreview[] = [];
  for (const candidate of text.match(URL_PATTERN) ?? []) {
    const preview = previewForUrl(candidate);
    if (!preview || seen.has(preview.url)) continue;
    seen.add(preview.url);
    out.push(preview);
  }
  return out;
}
