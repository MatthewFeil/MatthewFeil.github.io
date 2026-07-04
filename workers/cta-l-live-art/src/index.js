const CACHE_SECONDS = 10;

const CTA_BOUNDS = {
  north: 42.0738,
  south: 41.7224,
  west: -87.9048,
  east: -87.5802
};

const CTA_ROUTES = [
  { api: "red", line: "Red" },
  { api: "blue", line: "Blue" },
  { api: "brn", line: "Brown" },
  { api: "g", line: "Green" },
  { api: "org", line: "Orange" },
  { api: "p", line: "Purple" },
  { api: "pink", line: "Pink" },
  { api: "y", line: "Yellow" }
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/api/trains") {
      return json({ error: "not_found" }, { status: 404 });
    }

    if (url.pathname === "/") {
      return json({ ok: true, service: "cta-l-live-art" });
    }

    const cache = caches.default;
    const cacheKey = new Request(new URL("/api/trains", request.url).toString(), {
      method: "GET"
    });

    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, { "X-CTA-Cache": "HIT" });

    if (!env.CTA_TRAIN_TRACKER_API_KEY) {
      return json(
        {
          error: "missing_cta_api_key",
          detail: "Set the CTA_TRAIN_TRACKER_API_KEY Worker secret before using live CTA data."
        },
        { status: 503 }
      );
    }

    try {
      const payload = await fetchCtaSnapshot(env.CTA_TRAIN_TRACKER_API_KEY);
      const fetchedAt = new Date().toISOString();
      const response = json({
        ...payload,
        mode: "live",
        fetchedAt
      }, {
        headers: { "X-CTA-Cache": "MISS" }
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      const stale = await cache.match(cacheKey);
      if (stale) {
        const body = await stale.json();
        return json({
          ...body,
          mode: "stale",
          warning: error instanceof Error ? error.message : String(error)
        }, {
          headers: { "X-CTA-Cache": "STALE" }
        });
      }

      return json(
        {
          error: "cta_request_failed",
          detail: error instanceof Error ? error.message : String(error)
        },
        { status: 502 }
      );
    }
  }
};

async function fetchCtaSnapshot(apiKey) {
  const generatedAt = new Date().toISOString();
  const routeResponses = await Promise.all(
    CTA_ROUTES.map((route) => fetchRoute(apiKey, route))
  );

  const trains = routeResponses
    .flat()
    .sort((a, b) => a.line.localeCompare(b.line) || a.id.localeCompare(b.id));

  return {
    generatedAt,
    cacheSeconds: CACHE_SECONDS,
    source: "cta-train-tracker",
    mode: "live",
    bounds: CTA_BOUNDS,
    trains
  };
}

async function fetchRoute(apiKey, route) {
  const url = new URL("https://lapi.transitchicago.com/api/1.0/ttpositions.aspx");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("rt", route.api);
  url.searchParams.set("outputType", "JSON");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CTA ${route.line} request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const status = data.ctatt?.errCd;
  if (status && status !== "0") {
    throw new Error(
      `CTA ${route.line} request failed with API code ${status}: ${data.ctatt?.errNm ?? "unknown error"}`
    );
  }

  return normalizeRoutePayload(data, route);
}

function normalizeRoutePayload(data, route) {
  const apiTimestamp = ctaTimestampToIso(data.ctatt?.tmst) ?? new Date().toISOString();

  return asArray(data.ctatt?.route)
    .flatMap((routeBlock) => asArray(routeBlock.train))
    .map((train) => normalizeTrain(train, route.api, route.line, apiTimestamp))
    .filter(Boolean);
}

function normalizeTrain(train, route, line, apiTimestamp) {
  const lat = toNumber(train.lat);
  const lon = toNumber(train.lon);
  if (lat === null || lon === null) return null;

  const runNumber = cleanString(train.rn);
  return {
    id: runNumber ? `${line}-${runNumber}` : `${line}-${lat.toFixed(5)},${lon.toFixed(5)}`,
    line,
    route,
    destination: cleanString(train.destNm),
    geo: { lat, lon },
    position: normalizePosition(lat, lon),
    heading: toNumber(train.heading),
    delayed: train.isDly === true || train.isDly === "1" || String(train.isDly).toLowerCase() === "true",
    observedAt: ctaTimestampToIso(train.prdt) ?? apiTimestamp
  };
}

function normalizePosition(lat, lon) {
  const x = (lon - CTA_BOUNDS.west) / (CTA_BOUNDS.east - CTA_BOUNDS.west);
  const y = 1 - (lat - CTA_BOUNDS.south) / (CTA_BOUNDS.north - CTA_BOUNDS.south);

  return {
    x: clamp01(round4(x)),
    y: clamp01(round4(y))
  };
}

export function ctaTimestampToIso(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const compactMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day, hour, minute, second] = compactMatch.map(Number);
    const utcMillis = centralLocalTimeToUtcMillis({ year, month, day, hour, minute, second });
    return new Date(utcMillis).toISOString();
  }

  const localIsoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (localIsoMatch) {
    const [, year, month, day, hour, minute, second] = localIsoMatch.map(Number);
    const utcMillis = centralLocalTimeToUtcMillis({ year, month, day, hour, minute, second });
    return new Date(utcMillis).toISOString();
  }

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(cleaned)) {
    const parsed = new Date(cleaned);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function centralLocalTimeToUtcMillis(parts) {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return localAsUtc + centralUtcOffsetHours(parts) * 60 * 60 * 1000;
}

function centralUtcOffsetHours(parts) {
  return isCentralDaylightTime(parts) ? 5 : 6;
}

function isCentralDaylightTime(parts) {
  if (parts.month < 3 || parts.month > 11) return false;
  if (parts.month > 3 && parts.month < 11) return true;

  const secondSundayInMarch = nthWeekdayOfMonth(parts.year, 3, 0, 2);
  const firstSundayInNovember = nthWeekdayOfMonth(parts.year, 11, 0, 1);

  if (parts.month === 3) {
    return parts.day > secondSundayInMarch || (parts.day === secondSundayInMarch && parts.hour >= 2);
  }

  return parts.day < firstSundayInNovember || (parts.day === firstSundayInNovember && parts.hour < 2);
}

function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstWeekdayDate = 1 + ((weekday - firstDay + 7) % 7);
  return firstWeekdayDate + (occurrence - 1) * 7;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanString(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      ...CORS_HEADERS,
      ...init.headers
    }
  });
}

function withCors(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
