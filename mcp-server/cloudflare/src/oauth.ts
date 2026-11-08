import OAuthProvider, { AuthorizationError } from '@cloudflare/workers-oauth-provider';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { createGitHubMcpServer, type Secrets } from './admin';

const ORIGIN = 'https://personal-hub.leandroferlin5.workers.dev';
const RESOURCE = `${ORIGIN}/mcp-secure`;
const CALLBACK = `${ORIGIN}/callback`;
const SCOPES = ['hub:read', 'hub:write', 'hub:delete', 'offline_access'];

interface OAuthEnv extends Secrets {
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_GITHUB_USER_ID?: string;
  OAUTH_PROVIDER: any;
}

type AuthorizedContext = ExecutionContext & {
  auth: { scope: string[] };
  props: { userId: string; githubUserId: string };
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

function responsePage(title: string, content: string, status = 200, headers?: HeadersInit) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font:16px system-ui;max-width:640px;margin:4rem auto;padding:1rem"><h1>${escapeHtml(title)}</h1>${content}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", ...headers },
  });
}

function ensureGitHubIdentityConfig(env: OAuthEnv) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.ALLOWED_GITHUB_USER_ID) {
    throw new Error('GitHub sign-in is not configured');
  }
}

function githubAuthorizationUrl(env: OAuthEnv, state: string, challenge: string) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID!);
  url.searchParams.set('redirect_uri', CALLBACK);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // No "repo" or "user" scopes: GitHub is only the identity provider.
  return url.toString();
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function exchangeGitHubIdentity(env: OAuthEnv, code: string, verifier: string) {
  const exchange = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'personal-hub-mcp' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      redirect_uri: CALLBACK,
      code,
      code_verifier: verifier
    }),
  });
  if (!exchange.ok) throw new Error('GitHub code exchange failed');
  const token = await exchange.json() as { access_token?: string; error?: string };
  if (!token.access_token || token.error) throw new Error('GitHub did not issue an identity token');
  const identity = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.access_token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'personal-hub-mcp' }
  });
  if (!identity.ok) throw new Error('GitHub identity verification failed');
  const person = await identity.json() as { id?: number };
  if (!person.id || String(person.id) !== env.ALLOWED_GITHUB_USER_ID) {
    throw new Error('This GitHub identity is not authorized to use Personal Hub');
  }
  // Do not persist or forward the GitHub identity token.
  return String(person.id);
}

async function startGitHubLogin(env: OAuthEnv, approvedRequest: any, headers: Headers) {
  ensureGitHubIdentityConfig(env);
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const upstream = await env.OAUTH_PROVIDER.beginUpstream(approvedRequest, {
    data: { verifier },
    headers
  });
  upstream.headers.set('Location', githubAuthorizationUrl(env, upstream.state, await sha256Base64Url(verifier)));
  return new Response(null, { status: 302, headers: upstream.headers });
}

async function handleAuthorization(request: Request, env: OAuthEnv) {
  const oauth = env.OAUTH_PROVIDER;
  if (request.method === 'GET') {
    const parsed = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(parsed);
    const consent = await oauth.beginConsent(parsed);
    const clientName = escapeHtml(String(details.clientName || 'Unnamed MCP client'));
    const redirectHost = escapeHtml(String(details.redirectHost || 'unknown'));
    const clientDomain = details.clientDomain ? escapeHtml(String(details.clientDomain)) : '';
    const permissions = (details.scope as string[])
      .filter(s => s !== 'offline_access')
      .map(scope => `<li><code>${escapeHtml(scope)}</code></li>`).join('');
    const warning = details.redirectIsLoopback ? '<p><strong>This authorization sends access to an application running on your computer.</strong></p>' : '';
    const html = `<p><strong>${clientName}</strong> is requesting access to Personal Hub.</p>
<p>Client domain: ${clientDomain || 'Unverified/self-registered client'}</p>
<p>Token destination: <strong>${redirectHost}</strong></p>
${warning}<p>Requested permissions:</p><ul>${permissions}</ul>
<p>Only approve requests that you personally initiated. Write and delete permissions allow an agent to modify your GitHub repository.</p>
<form method="POST"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><button name="decision" value="approve">Approve</button> <button name="decision" value="deny">Deny</button></form>`;
    const responseHeaders = consent.headers;
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
    return responsePage('Authorize Personal Hub', html, 200, responseHeaders);
  }
  if (request.method === 'POST') {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '');
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    // Approve only the scopes already requested; no client-controlled privilege increase.
    const approved = await oauth.approveConsent(request, handle, {});
    return startGitHubLogin(env, approved.request, approved.headers);
  }
  return new Response('Method Not Allowed', { status: 405 });
}

async function handleCallback(request: Request, env: OAuthEnv) {
  ensureGitHubIdentityConfig(env);
  const oauth = env.OAUTH_PROVIDER;
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
  const params = new URL(request.url).searchParams;
  if (params.has('error') || !params.get('code')) {
    return responsePage('Authorization canceled', '<p>GitHub sign-in was canceled. Return to your MCP client and try again.</p>', 403);
  }
  const githubUserId = await exchangeGitHubIdentity(env, params.get('code')!, data.verifier);
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: 'user-001',
    metadata: {},
    scope: original.scope,
    props: { userId: 'user-001', githubUserId }
  });
  headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers });
}

const defaultHandler = {
  async fetch(request: Request, env: OAuthEnv) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/authorize') return await handleAuthorization(request, env);
      if (path === '/callback') return await handleCallback(request, env);
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError) {
        return responsePage('Invalid authorization request', `<p>${escapeHtml(error.description)}</p>`, 400);
      }
      // Never disclose tokens, upstream responses, or stack traces to the client.
      console.error('OAuth request failed', error instanceof Error ? error.name : 'UnknownError');
      return responsePage('Authorization unavailable', '<p>Authorization could not be completed. Check the Worker configuration and logs.</p>', 503);
    }
  }
};

const protectedHandler = {
  async fetch(request: Request, env: OAuthEnv, ctx: ExecutionContext) {
    const session = ctx as AuthorizedContext;
    if (session.props?.userId !== 'user-001' || session.props.githubUserId !== env.ALLOWED_GITHUB_USER_ID) {
      return new Response('Forbidden', { status: 403 });
    }
    const scopes = session.auth?.scope || [];
    if (!scopes.includes('hub:read')) return new Response('Missing hub:read scope', { status: 403 });
    if (!env.GITHUB_TOKEN) return new Response('GitHub repository access is not configured', { status: 503 });
    return createMcpHandler(() => createGitHubMcpServer(env, scopes)).fetch(request);
  }
};

export const personalHubOAuth = new OAuthProvider<OAuthEnv>({
  apiRoute: '/mcp-secure',
  apiHandler: protectedHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: SCOPES,
  requiredScopes: ['hub:read'],
  resourceMetadata: {
    resource: RESOURCE,
    authorization_servers: [ORIGIN]
  },
  clientIdMetadataDocumentEnabled: true,
});
