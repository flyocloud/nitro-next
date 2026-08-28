/**
 * Draft links — the bits the server helpers and the proxy have to agree on.
 *
 * A draft link is a shareable, expiring snapshot of an entity that is still
 * offline in Flyo. It is requested through the very same endpoints as any other
 * entity (`entityBySlug()` / `entityByUniqueid()`) with an opaque token in place
 * of the slug or the unique id, and the response carries `is_draft: true` plus a
 * `draft_expires_at` timestamp.
 *
 * Because the token *is* the route parameter, nothing about the incoming request
 * says "this is a draft" — that is only known once the API has answered, deep
 * inside the render. A Server Component cannot set response headers, so the
 * render cannot take the page out of the browser and CDN cache by itself. What
 * it can do is bounce the request once to the same URL carrying a marker, which
 * the proxy — which *does* run early enough to set headers — recognises on the
 * second pass.
 *
 * The two request headers below carry the rest of that handshake: the proxy
 * tells the render whether the marker is already there, and what URL to bounce
 * to if it isn't.
 *
 * This module deliberately imports nothing: `proxy.ts` is bundled for the edge
 * runtime and must not pull the server bundle (React, `next/navigation`, the
 * Flyo SDK) in behind a shared constant.
 */

/** Query parameter appended to a draft URL so the proxy can recognise it. */
export const DEFAULT_DRAFT_URL_MARKER = 'flyo-draft';

/** Set by the proxy when the incoming request already carries the draft marker. */
export const DRAFT_REQUEST_HEADER = 'x-flyo-draft';

/**
 * Set by the proxy on every request: the current `pathname + search`. A draft
 * render reads it to build the URL it redirects to, since a Server Component has
 * no other way to learn the URL it is rendering.
 */
export const DRAFT_PATH_HEADER = 'x-flyo-path';

/** The only value the marker is ever given, and the only one the proxy accepts. */
const DRAFT_MARKER_VALUE = '1';

/**
 * `true` when `searchParams` carries the draft marker. `marker` is `null` on
 * instances that switched draft URL marking off, where no request is ever a
 * draft request as far as the proxy is concerned.
 */
export function hasDraftMarker(searchParams: URLSearchParams, marker: string | null): boolean {
  return marker !== null && searchParams.get(marker) === DRAFT_MARKER_VALUE;
}

/**
 * Append the draft marker to a `pathname + search` string, preserving any query
 * parameters that are already there. Returns the path unchanged when the marker
 * is already set, so a caller that hands back its own output cannot build a
 * redirect loop.
 */
export function withDraftMarker(path: string, marker: string): string {
  const queryStart = path.indexOf('?');
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const search = queryStart === -1 ? '' : path.slice(queryStart + 1);

  const params = new URLSearchParams(search);

  if (params.get(marker) === DRAFT_MARKER_VALUE) {
    return path;
  }

  params.set(marker, DRAFT_MARKER_VALUE);

  return `${pathname}?${params.toString()}`;
}
