import {
  jsonResponse,
  optionsResponse,
  requireAllowedOrigin,
  verifyPersonalSpaceUser,
} from "../_shared/personal-security.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ownerUserId = Deno.env.get("PERSONAL_OWNER_USER_ID") || "";

type Stock = {
  id: string;
  symbol: string;
  name: string | null;
};

type PricePoint = {
  date: string;
  close: number;
};

type PortfolioBody = {
  action?: string;
  id?: string;
  symbol?: string;
  name?: string;
  stock_id?: string;
  logged_at?: string;
  entry_type?: string;
  purchase_price?: number;
  total_purchase_amount?: number;
};

const tickerPattern = /^[A-Z0-9.=-]{1,16}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entryTypes = new Set(["additional_investment", "reinvested_dividend"]);

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function supabase(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Database request failed.");
  return data;
}

async function getQuotes(stocks: Stock[]) {
  if (stocks.length === 0) return {};

  const entries = await Promise.all(stocks.map(async (stock) => {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.symbol)}?interval=1d&range=2y`,
        { headers: { "user-agent": "Mozilla/5.0" } },
      );
      if (!response.ok) return null;

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta) return null;

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const history = timestamps
        .map((timestamp: number, index: number) => ({
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          close: closes[index],
        }))
        .filter((item: { date: string; close: unknown }): item is PricePoint => (
          typeof item.close === "number" && Number.isFinite(item.close) && item.close > 0
        ));
      const lastClose = history.length > 0 ? history[history.length - 1].close : null;
      const price = typeof meta.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0
        ? meta.regularMarketPrice
        : lastClose;
      if (!price) return null;

      return [stock.symbol, {
        price,
        marketTime: meta.regularMarketTime,
        currency: meta.currency,
        history,
      }];
    } catch {
      return null;
    }
  }));

  return Object.fromEntries(entries.filter(Boolean) as [string, unknown][]);
}

async function listPortfolio() {
  const stocks = await supabase("portfolio_stocks?select=*&order=symbol.asc") as Stock[];
  const logs = await supabase("portfolio_logs?select=*&order=logged_at.desc,created_at.desc");
  const quotes = await getQuotes(stocks);
  return { stocks, logs, quotes };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const originError = requireAllowedOrigin(request);
  if (originError) return originError;

  const json = (body: unknown, status = 200) => jsonResponse(request, body, status);
  if (request.method === "GET" || request.method === "HEAD") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const unlocked = await verifyPersonalSpaceUser(request, supabaseUrl, publishableKey, ownerUserId);
    if (!unlocked) return json({ error: "Personal Space sign-in required." }, 401);

    const body = await request.json().catch(() => ({})) as PortfolioBody;

    if (body.action === "list") return json(await listPortfolio());

    if (body.action === "addStock") {
      const symbol = body.symbol?.trim().toUpperCase();
      if (!symbol) return json({ error: "Ticker symbol is required." }, 400);
      if (!tickerPattern.test(symbol)) return json({ error: "Enter a ticker with up to 16 letters, numbers, periods, equals signs, or hyphens." }, 400);
      if (body.name && body.name.trim().length > 120) return json({ error: "Stock name must be 120 characters or fewer." }, 400);
      const existing = await supabase(`portfolio_stocks?symbol=eq.${encodeURIComponent(symbol)}&select=id`) as Stock[];
      if (existing.length > 0) return json({ error: `${symbol} is already being tracked.` }, 409);
      await supabase("portfolio_stocks", {
        method: "POST",
        body: JSON.stringify({ symbol, name: body.name?.trim() || null }),
      });
      return json(await listPortfolio());
    }

    if (body.action === "addLog") {
      if (!body.stock_id || !body.logged_at || !body.entry_type || body.purchase_price === undefined || body.total_purchase_amount === undefined) {
        return json({ error: "Every log field is required." }, 400);
      }
      if (!uuidPattern.test(body.stock_id)) return json({ error: "Choose a valid stock before saving this log." }, 400);
      if (!isDateKey(body.logged_at) || body.logged_at > new Date().toISOString().slice(0, 10)) {
        return json({ error: "Choose a valid date that is not in the future." }, 400);
      }
      if (!entryTypes.has(body.entry_type)) return json({ error: "Choose a valid investment type." }, 400);
      if (!isPositiveFinite(body.purchase_price) || !isPositiveFinite(body.total_purchase_amount)) {
        return json({ error: "Purchase price and amount must be greater than zero." }, 400);
      }
      const stocks = await supabase(`portfolio_stocks?id=eq.${encodeURIComponent(body.stock_id)}&select=id`) as Stock[];
      if (stocks.length === 0) return json({ error: "That stock no longer exists. Refresh and try again." }, 400);
      await supabase("portfolio_logs", {
        method: "POST",
        body: JSON.stringify({
          stock_id: body.stock_id,
          logged_at: body.logged_at,
          entry_type: body.entry_type,
          purchase_price: body.purchase_price,
          total_purchase_amount: body.total_purchase_amount,
        }),
      });
      return json(await listPortfolio());
    }

    if (body.action === "deleteStock" && body.id && uuidPattern.test(body.id)) {
      await supabase(`portfolio_stocks?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(await listPortfolio());
    }

    if (body.action === "deleteLog" && body.id && uuidPattern.test(body.id)) {
      await supabase(`portfolio_logs?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(await listPortfolio());
    }

    return json({ error: "Unknown portfolio action." }, 400);
  } catch (error) {
    console.error("Portfolio API error", error);
    return json({ error: "The portfolio service is unavailable. Please try again." }, 500);
  }
});
