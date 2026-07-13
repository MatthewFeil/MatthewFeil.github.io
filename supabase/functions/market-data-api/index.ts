import {
  cleanInvestmentSymbol,
  getInvestmentHistory,
  getInvestmentInflation,
  parseIsoDate,
} from "../_shared/market-data.ts";
import {
  jsonResponse,
  optionsResponse,
  requireAllowedOrigin,
} from "../_shared/personal-security.ts";

type MarketDataBody = {
  action?: string;
  symbol?: string;
  start_date?: string;
  end_date?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const originError = requireAllowedOrigin(request);
  if (originError) return originError;

  const json = (body: unknown, status = 200) => jsonResponse(request, body, status);
  if (request.method === "GET" || request.method === "HEAD") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({})) as MarketDataBody;
    const startDate = parseIsoDate(body.start_date);
    const endDate = body.end_date ? parseIsoDate(body.end_date) : new Date();

    if (!startDate) return json({ error: "Choose a valid start date." }, 400);
    if (!endDate) return json({ error: "Choose a valid end date." }, 400);
    if (startDate > new Date() || endDate > new Date()) {
      return json({ error: "Choose dates that have already happened." }, 400);
    }
    if (endDate < startDate) return json({ error: "Choose an end date after the start date." }, 400);

    if (body.action === "investmentHistory") {
      const symbol = cleanInvestmentSymbol(body.symbol);
      if (!symbol) return json({ error: "Ticker symbol is required." }, 400);
      return json(await getInvestmentHistory(symbol, startDate, endDate));
    }

    if (body.action === "inflationData") {
      return json(await getInvestmentInflation(startDate, endDate));
    }

    return json({ error: "Unknown market data action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected market data error." }, 500);
  }
});
