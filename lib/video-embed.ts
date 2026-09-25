export function videoEmbedUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  else if (host === "youtube.com") {
    id =
      url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? null;
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  } else if (host === "vimeo.com" || host === "player.vimeo.com") {
    id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1] ?? null;
    if (id) return `https://player.vimeo.com/video/${id}`;
  }
  return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
}
