const defaultAllowedOrigins = [
  "https://matthewfeil.com",
  "https://www.matthewfeil.com",
];

const allowedHeaders = "authorization, x-client-info, apikey, content-type, x-personal-token";
const allowedMethods = "GET, HEAD, POST, OPTIONS";

type RateLimitResult = {
  allowed: boolean;
  attempt_count?: number;
  retry_after_seconds?: number;
};

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function base64UrlEncode(value: string | ArrayBuffer) {
  const binary = typeof value === "string"
    ? value
    : String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  return atob(padded);
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

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signTokenPayload(payloadPart: string, secret: string) {
  return base64UrlEncode(await hmacSha256(secret, payloadPart));
}

export async function createPersonalSpaceToken(secret: string, ttlSeconds: number) {
  if (!secret) {
    throw new Error("Personal Space token secret is not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "matthewfeil-site",
    scope: "personal-space",
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = await signTokenPayload(payloadPart, secret);

  return {
    token: `${payloadPart}.${signaturePart}`,
    expiresAt: payload.exp * 1000,
  };
}

export async function verifyPersonalSpaceToken(request: Request, secret: string) {
  if (!secret) return false;

  const token = request.headers.get("x-personal-token") || "";
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const expectedSignature = await signTokenPayload(parts[0], secret);
  if (!timingSafeEqual(parts[1], expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload?.scope === "personal-space" &&
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export async function verifyPersonalSpacePassword(password: unknown) {
  const passwordText = String(password || "");
  const configuredHash = Deno.env.get("PERSONAL_SPACE_PASSWORD_HASH") || "";
  const configuredSalt = Deno.env.get("PERSONAL_SPACE_PASSWORD_SALT") || "";

  if (configuredHash) {
    const candidateHash = await sha256Hex(`${configuredSalt}${passwordText}`);
    return timingSafeEqual(candidateHash, configuredHash.toLowerCase());
  }

  const configuredPassword = Deno.env.get("PERSONAL_SPACE_PASSWORD") || "";
  return Boolean(configuredPassword) && timingSafeEqual(passwordText, configuredPassword);
}

function clientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    forwardedFor.split(",")[0]?.trim(),
  ];

  return candidates.find(Boolean) || "unknown";
}

async function rateLimitKeyHash(request: Request) {
  const secret = Deno.env.get("PERSONAL_RATE_LIMIT_SECRET") ||
    Deno.env.get("PERSONAL_SPACE_TOKEN_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "personal-rate-limit";

  return sha256Hex(`${secret}:${clientIp(request)}`);
}

async function recordUnlockAttempt(
  supabaseUrl: string,
  serviceRoleKey: string,
  keyHash: string,
  windowSeconds: number,
  limit: number,
) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError("Rate limit storage is not configured.", 500);
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_personal_unlock_attempt`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "authorization": `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_key_hash: keyHash,
      p_action: "unlockPersonal",
      p_window_seconds: windowSeconds,
      p_limit: limit,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(data?.message || "Rate limit check failed.", 500);
  }

  return (Array.isArray(data) ? data[0] : data) as RateLimitResult;
}

export async function enforceUnlockRateLimit(request: Request, supabaseUrl: string, serviceRoleKey: string) {
  const keyHash = await rateLimitKeyHash(request);
  const checks = await Promise.all([
    recordUnlockAttempt(supabaseUrl, serviceRoleKey, keyHash, 60, 5),
    recordUnlockAttempt(supabaseUrl, serviceRoleKey, keyHash, 60 * 60, 20),
  ]);
  const blocked = checks.filter((check) => !check.allowed);

  if (blocked.length === 0) return null;

  const retryAfter = Math.max(
    1,
    ...blocked.map((check) => Number(check.retry_after_seconds || 1)),
  );

  return jsonResponse(
    request,
    { error: "Too many unlock attempts. Try again later." },
    429,
    { "Retry-After": String(retryAfter) },
  );
}
