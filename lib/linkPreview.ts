import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type LinkMetadata = {
  title: string;
  description: string | null;
  image: string | null;
};

// Decodes just the handful of HTML entities that actually show up in
// og:title/og:description/<title> text in practice -- not a full HTML
// entity table, since this is metadata text, not markup, and a missed
// obscure entity just leaves a `&something;` visible rather than
// breaking anything.
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  // Attribute order in the tag is not guaranteed (content before or
  // after property/name), so two patterns per lookup rather than one.
  const patterns = [
    new RegExp(`<meta[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return null;
}

// Blocks the well-known private/loopback/link-local ranges (including
// the cloud metadata endpoint at 169.254.169.254, a classic SSRF
// target) plus IPv6 equivalents. Not an exhaustive reserved-range list
// -- just the ranges that actually matter for "don't let a teacher's
// pasted URL reach something on our own network."
function isPrivateOrReservedIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 0) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  return false;
}

async function resolveAndGuard(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }
  let resolvedIp: string;
  try {
    const result = await lookup(url.hostname);
    resolvedIp = result.address;
  } catch {
    throw new Error("Couldn't resolve that address.");
  }
  if (isPrivateOrReservedIp(resolvedIp)) {
    throw new Error("That address can't be used for a link preview.");
  }
}

/**
 * Fetches a teacher-supplied URL and extracts Open Graph / meta title,
 * description, and image -- for #22 Link Preview. The URL is arbitrary
 * user input reaching a server-side fetch, which is a textbook SSRF
 * vector (a note could otherwise be used to probe or hit internal
 * services, including cloud metadata endpoints), so every hop's
 * hostname is resolved and checked against private/loopback/link-local
 * ranges before it's fetched -- including redirects. Redirects are
 * followed manually (not via `fetch`'s own `redirect: "follow"`)
 * specifically because a URL could pass the initial check on a public
 * hostname and then 302 to a private IP; auto-follow would fetch that
 * hop without ever re-checking it. Also caps how much of the response
 * body gets read, since og: tags are always in <head>.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  const MAX_REDIRECTS = 5;
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await resolveAndGuard(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          // Some sites serve a bare, meta-tag-free page to unrecognized
          // clients -- a normal browser UA gets the real og: tags most
          // of the time without needing per-site special-casing.
          "User-Agent": "Mozilla/5.0 (compatible; SchoolAppLinkPreview/1.0; +link-preview-fetch)",
          Accept: "text/html",
        },
      });
    } catch {
      throw new Error("Couldn't reach that URL.");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Couldn't reach that URL.");
      url = new URL(location, url); // resolves relative redirects too
      continue;
    }
    break;
  }

  if (!response) {
    throw new Error("Couldn't reach that URL.");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("That URL redirects too many times.");
  }
  if (!response.ok) {
    throw new Error(`That URL returned an error (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("That URL isn't a webpage (link previews only support HTML pages).");
  }

  // Cap how much we read -- og: tags are always in <head>, so nothing
  // past roughly the first 200KB is ever needed, and a malicious or
  // just enormous page shouldn't be read in full just to find a title.
  const reader = response.body?.getReader();
  let html = "";
  if (reader) {
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const MAX_BYTES = 200_000;
    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
  } else {
    html = await response.text();
  }

  const ogTitle = extractMetaContent(html, "property", "og:title");
  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title =
    ogTitle || (titleTagMatch ? decodeEntities(titleTagMatch[1]).trim() : null) || url.hostname;

  const description =
    extractMetaContent(html, "property", "og:description") ??
    extractMetaContent(html, "name", "description");

  let image =
    extractMetaContent(html, "property", "og:image") ??
    extractMetaContent(html, "name", "twitter:image");
  // og:image is often relative to the page's own origin -- resolve it
  // against the fetched URL so the stored `file_url` is always a
  // complete, directly-usable link.
  if (image) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = null;
    }
  }

  return { title, description, image };
}
