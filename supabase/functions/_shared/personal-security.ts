const defaultAllowedOrigins = [
  "https://matthewfeil.com",
  "https://www.matthewfeil.com",
];

const allowedHeaders = "authorization, x-client-info, apikey, content-type";
const allowedMethods = "GET, HEAD, POST, OPTIONS";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function base64UrlEncode(value: string | ArrayBuffer) {
  const binary = typeof value === "string"
    ? value
    : String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function configuredAllowedOrigins() {
  return (Deno.env.get("PERSONAL_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedLocalPreview(origin: URL) {
  const localHosts = new Set(["127.0.0.1", "localhost"]);
  const port = Number(origin.port);
  return origin.protocol === "http:" &&
    localHosts.has(origin.hostname) &&
    Number.isInteger(port) &&
    port >= 4000 &&
    port <= 4010;
}

export function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;

  const allowedOrigins = new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins()]);
  if (allowedOrigins.has(origin)) return true;

  try {
    return isAllowedLocalPreview(new URL(origin));
  } catch {
    return false;
  }
}

export function corsHeaders(request: Request) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": allowedMethods,
    "Vary": "Origin",
  });

  const origin = request.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin || "");
  }

  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json");
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));

  return new Response(JSON.stringify(body), { status, headers });
}

export function optionsResponse(request: Request) {
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return jsonResponse(request, { error: "Origin not allowed." }, 403);
  }

  return new Response("ok", { headers: corsHeaders(request) });
}

export function requireAllowedOrigin(request: Request) {
  if (isAllowedOrigin(request.headers.get("origin"))) return null;
  return jsonResponse(request, { error: "Origin not allowed." }, 403);
}

export async function verifyPersonalSpaceUser(
  request: Request,
  supabaseUrl: string,
  publishableKey: string,
  ownerUserId: string,
) {
  if (!supabaseUrl || !publishableKey || !ownerUserId) {
    throw new HttpError("Personal Space Auth is not configured.", 500);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization,
    },
  });

  if (response.status === 401 || response.status === 403) return false;
  const user = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(user?.message || "Auth verification failed.", 500);
  }

  return user?.id === ownerUserId;
}
