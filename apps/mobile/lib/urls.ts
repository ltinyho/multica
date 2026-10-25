export const DEFAULT_API_URL = "https://api.multica.ai";
export const DEFAULT_WS_URL = "wss://api.multica.ai/ws";
export const DEFAULT_WEB_URL = "https://multica.ai";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.VITE_API_URL ?? DEFAULT_API_URL;

export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ?? process.env.VITE_WS_URL ?? DEFAULT_WS_URL;

export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? process.env.VITE_APP_URL ?? DEFAULT_WEB_URL;

/** Resolve a possibly-relative download URL to an absolute HTTPS URL.
 *  The server returns `download_url` as a relative path (e.g.
 *  `/uploads/workspaces/...`); `Linking.openURL` and image loaders need
 *  a full URL. Already-absolute URLs pass through unchanged. */
export function resolveDownloadUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}
