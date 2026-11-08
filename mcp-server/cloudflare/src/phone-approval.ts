/**
 * Optional, browser-mediated phone approval for VS Code's standard OAuth+PKCE flow.
 *
 * The corporate laptop keeps its original OAuth browser transaction and binding
 * cookie. The phone authenticates with GitHub independently, then marks a
 * high-entropy pairing code approved. The laptop must explicitly finish the
 * same consent transaction. No OAuth token or GitHub credential crosses devices.
 */
import {
  githubAuthorizationUrl,
  sha256Base64Url,
  exchangeGitHubIdentity,
  type OAuthEnv
} from './oauth';

const TTL_SECONDS = 600;
const PAIR_PREFIX = 'phone-pair:';
const STATE_PREFIX = 'phone-state:';
const PHONE_COOKIE = '__Host-personal-hub-phone-state';
const noStore = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
};

type Pair = {
  handle: string;
  clientName: string;
  redirectHost: string;
  scopes: string[];
  status: 'pending' | 'approved';
  githubUserId?: string;
};
type PhoneState = { code: string; verifier: string };

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, x => '&#' + x.charCodeAt(0) + ';');
}
function page(title: string, body: string, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  for (const [key, value] of Object.entries(noStore)) h.set(key, value);
  h.set('Content-Type', 'text/html; charset=utf-8');
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    htmlEscape(title) + '</title></head><body style="font:16px system-ui;max-width:600px;margin:3rem auto;padding:1rem"><h1>' +
    htmlEscape(title) + '</h1>' + body + '</body></html>', { status, headers: h });
}
function codeNormalize(raw: string) {
  return raw.replace(/[-\s]/g, '').toUpperCase();
}
function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function prettyCode(code: string) {
  return code.match(/.{1,5}/g)?.join('-') || code;
}
function strongNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function reject(message: string, status = 400) {
  return page('Phone approval', '<p>' + htmlEscape(message) + '</p>', status);
}

export async function createPair(env: OAuthEnv, details: {
  handle: string;
  clientName: string;
  redirectHost: string;
  scopes: string[];
}) {
  const code = createCode();
  await env.OAUTH_KV.put(PAIR_PREFIX + code, JSON.stringify({
    ...details, status: 'pending'
  } satisfies Pair), { expirationTtl: TTL_SECONDS });
  return { code, displayedCode: prettyCode(code) };
}

export function renderPairOption(displayedCode: string, handle: string, requestedScopes: string[]) {
  return '<hr><h2>Approve from your personal phone</h2>' +
    '<p>If GitHub is blocked on this computer, open <strong>https://personal-hub.leandroferlin5.workers.dev/phone</strong> on your phone and enter:</p>' +
    '<p style="font-size:1.45rem;letter-spacing:.06em"><strong>' + htmlEscape(displayedCode) + '</strong></p>' +
    '<p>Authenticate with GitHub on the phone and approve the request. Keep this computer page open.</p>' +
    '<form method="POST">' +
    '<input type="hidden" name="handle" value="' + htmlEscape(handle) + '">' +
    '<input type="hidden" name="phone_code" value="' + htmlEscape(codeNormalize(displayedCode)) + '">' +
    requestedScopes.map(s => '<input type="hidden" name="scope" value="' + htmlEscape(s) + '">').join('') +
    '<button name="decision" value="phone-complete">I approved on my phone — finish on this computer</button>' +
    '</form><p><small>Code expires after 10 minutes. This option must comply with your organization’s access policies.</small></p>';
}

export async function finishPair(
  request: Request,
  env: OAuthEnv,
  handle: string,
  codeRaw: string
): Promise<Response> {
  const code = codeNormalize(codeRaw);
  const pair = await env.OAUTH_KV.get<Pair>(PAIR_PREFIX + code, 'json');
  if (!pair || pair.handle !== handle) return reject('This pairing request expired. Restart authorization.', 410);
  if (pair.status !== 'approved' || pair.githubUserId !== env.ALLOWED_GITHUB_USER_ID) {
    return reject('Not approved yet. Finish GitHub authentication and approval on your phone, then try again.', 409);
  }
  // This SDK call verifies the original laptop browser's consent binding cookie.
  // Never issue authorization codes just because a pairing code was approved.
  const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle, { scope: pair.scopes });
  // Prevent accidental multiple completion attempts; consent handle itself is single-use.
  await env.OAUTH_KV.delete(PAIR_PREFIX + code);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: approved.request,
    userId: 'user-001',
    metadata: {},
    scope: pair.scopes,
    props: { userId: 'user-001', githubUserId: pair.githubUserId }
  });
  approved.headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers: approved.headers });
}

export async function phoneLanding(request: Request, env: OAuthEnv) {
  const code = codeNormalize(new URL(request.url).searchParams.get('code') || '');
  const entry = '<form method="GET" action="/phone"><label for="code">Pairing code shown on your computer</label><p><input id="code" name="code" required autocomplete="off" spellcheck="false" maxlength="28" value="' +
    htmlEscape(code) + '" style="font:1.15rem monospace;width:95%;padding:.5rem"></p><button type="submit">Find request</button></form>';
  if (!/^[A-F0-9]{20}$/.test(code)) return page('Approve Personal Hub from phone', '<p>Enter the code displayed on your laptop.</p>' + entry);
  const pair = await env.OAUTH_KV.get<Pair>(PAIR_PREFIX + code, 'json');
  if (!pair) return reject('Pairing code not found or expired.', 404);
  if (pair.status === 'approved') return page('Phone approval complete', '<p>Approved. Return to the original browser page on your computer and select <strong>finish on this computer</strong>.</p>');
  const scopes = pair.scopes.map(x => '<li><code>' + htmlEscape(x) + '</code></li>').join('');
  return page('Review Personal Hub access', '<p><strong>' + htmlEscape(pair.clientName) + '</strong> is requesting access.</p>' +
    '<p>OAuth callback destination: <strong>' + htmlEscape(pair.redirectHost) + '</strong></p>' +
    '<p>Requested scopes:</p><ul>' + scopes + '</ul>' +
    '<p>Approve only if you initiated the request on the computer and recognize the destination.</p>' +
    '<form action="/phone/start" method="POST"><input type="hidden" name="code" value="' + code + '">' +
    '<button type="submit">Authenticate with GitHub and approve</button></form>');
}

export async function startPhoneLogin(request: Request, env: OAuthEnv) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const form = await request.formData();
  const code = codeNormalize(String(form.get('code') || ''));
  if (!/^[A-F0-9]{20}$/.test(code)) return reject('Invalid pairing code.');
  const pair = await env.OAUTH_KV.get<Pair>(PAIR_PREFIX + code, 'json');
  if (!pair || pair.status !== 'pending') return reject('This pairing request is no longer pending.', 410);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.ALLOWED_GITHUB_USER_ID) {
    return reject('GitHub login is not configured.', 503);
  }
  const nonce = strongNonce();
  const state = 'ph_' + nonce;
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  await env.OAUTH_KV.put(STATE_PREFIX + state, JSON.stringify({ code, verifier } satisfies PhoneState), { expirationTtl: TTL_SECONDS });
  const headers = new Headers({ Location: githubAuthorizationUrl(env, state, await sha256Base64Url(verifier)) });
  headers.append('Set-Cookie', PHONE_COOKIE + '=' + state + '; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600');
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers });
}

export async function completePhoneLogin(request: Request, env: OAuthEnv) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookie = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(PHONE_COOKIE + '='));
  if (!state.startsWith('ph_') || !cookie || cookie.slice(PHONE_COOKIE.length + 1) !== state) {
    return reject('Phone sign-in session missing or invalid. Restart with a new pairing code.', 403);
  }
  const pending = await env.OAUTH_KV.get<PhoneState>(STATE_PREFIX + state, 'json');
  if (!pending) return reject('Phone sign-in expired or already completed.', 410);
  await env.OAUTH_KV.delete(STATE_PREFIX + state);
  const clear = { 'Set-Cookie': PHONE_COOKIE + '=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' };
  if (url.searchParams.get('error') || !url.searchParams.get('code')) {
    return page('GitHub login canceled', '<p>Access was not granted.</p>', 403, clear);
  }
  const userId = await exchangeGitHubIdentity(env, url.searchParams.get('code')!, pending.verifier);
  const pair = await env.OAUTH_KV.get<Pair>(PAIR_PREFIX + pending.code, 'json');
  if (!pair || pair.status !== 'pending') return reject('The computer pairing request expired.', 410);
  await env.OAUTH_KV.put(PAIR_PREFIX + pending.code, JSON.stringify({ ...pair, status: 'approved', githubUserId: userId } satisfies Pair), { expirationTtl: TTL_SECONDS });
  return page('Approval complete', '<p>You have authenticated and approved this Personal Hub request. Return to the original authorization page on your computer and click <strong>I approved on my phone — finish on this computer</strong>.</p>', 200, clear);
}
