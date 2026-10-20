/**
 * Validation of payment provider return URLs.
 *
 * A checkout return URL is a redirect the customer lands on after paying, so
 * it must point at a host we control. The allowlist is built from the
 * deployment's own configuration rather than being hard-coded, because the
 * public hostname differs between environments (a Vercel subdomain, a custom
 * domain, localhost in development).
 *
 * This is deliberately separate from the CORS list: CORS controls which
 * browsers may call the API, this controls where a customer may be sent after
 * paying. They usually overlap, but a misconfigured allowlist here silently
 * breaks the Upgrade button while everything else looks healthy.
 */

// Environments that provide billing return URLs. Sources are combined (not
// first-match) so a deployment works with any of them: explicit
// ALLOWED_RETURN_HOSTS, the frontend's public URL, or the CORS origin list
// (CORS_ORIGINS) which production already sets.
export const RETURN_URL_ENV_SOURCES = [
  'ALLOWED_RETURN_HOSTS',
  'FRONTEND_PUBLIC_URL',
  'VITE_FRONTEND_URL',
  'FRONTEND_URL',
  'CORS_ORIGINS',
];

/** Accepts both bare hosts (`waflo.vercel.app`) and origins (`https://waflo.vercel.app`). */
export function normalizeHost(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('://')) {
    try {
      return new URL(v).host.toLowerCase();
    } catch {
      return null;
    }
  }
  return v;
}

/** Every host the deployment says it serves, from any of the config sources. */
export function allowedReturnHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return RETURN_URL_ENV_SOURCES
    .flatMap((name) => (env[name] || '').split(','))
    .map(normalizeHost)
    .filter((h): h is string => Boolean(h))
    .filter((h, i, arr) => arr.indexOf(h) === i);
}

export function isAllowedReturnUrl(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.host.toLowerCase();
    const allowedHosts = allowedReturnHosts(env);
    if (allowedHosts.length === 0) {
      // Nothing configured: allow local development only. Compare the
      // hostname without the port, otherwise http://localhost:3000 - the
      // actual development frontend - never matches.
      const hostname = parsed.hostname.toLowerCase();
      return hostname === 'localhost' || hostname === '127.0.0.1';
    }
    return allowedHosts.includes(host);
  } catch {
    return false;
  }
}
