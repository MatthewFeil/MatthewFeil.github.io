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
        typeof item.close === "number" && Number.isFinite(item.close)
      ));
    const lastClose = history.length > 0 ? history[history.length - 1].close : null;
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : lastClose;
    if (!price) return null;

    return [stock.symbol, {
      price,
      marketTime: meta.regularMarketTime,
      currency: meta.currency,
      history,
    }];
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
      await supabase("portfolio_stocks", {
        method: "POST",
        body: JSON.stringify({ symbol, name: body.name?.trim() || null }),
      });
      return json(await listPortfolio());
    }

    if (body.action === "addLog") {
      if (!body.stock_id || !body.logged_at || !body.entry_type || !body.purchase_price || !body.total_purchase_amount) {
        return json({ error: "Every log field is required." }, 400);
      }
      if (body.purchase_price <= 0 || body.total_purchase_amount <= 0) {
        return json({ error: "Purchase price and amount must be greater than zero." }, 400);
      }
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

    if (body.action === "deleteStock" && body.id) {
      await supabase(`portfolio_stocks?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(await listPortfolio());
    }

    if (body.action === "deleteLog" && body.id) {
      await supabase(`portfolio_logs?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json(await listPortfolio());
    }

    return json({ error: "Unknown portfolio action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected portfolio error." }, 500);
  }
});
