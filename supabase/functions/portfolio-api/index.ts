const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-personal-token',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS'
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const personalSpacePassword = Deno.env.get('PERSONAL_SPACE_PASSWORD') || '';
const personalSpaceTokenSecret = Deno.env.get('PERSONAL_SPACE_TOKEN_SECRET') || '';
const personalSpaceTokenTtlSeconds = 8 * 60 * 60;

type Stock = {
  id: string;
  symbol: string;
  name: string | null;
};

type PricePoint = {
  date: string;
  close: number;
};

type InvestmentPricePoint = {
  date: string;
  price: number;
};

type InflationPoint = {
  year: number;
  value: number;
};

type PortfolioBody = {
  action?: string;
  password?: string;
  id?: string;
  symbol?: string;
  name?: string;
  start_date?: string;
  end_date?: string;
  stock_id?: string;
  logged_at?: string;
  entry_type?: string;
  purchase_price?: number;
  total_purchase_amount?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}

async function supabase(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {})
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || 'Database request failed.');
  }
  return data;
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const binary = typeof value === 'string'
    ? value
    : String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return atob(padded);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function signTokenPayload(payloadPart: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(personalSpaceTokenSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  return base64UrlEncode(signature);
}

async function createPersonalSpaceToken() {
  if (!personalSpaceTokenSecret) {
    throw new Error('Personal Space token secret is not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'matthewfeil-site',
    scope: 'personal-space',
    iat: now,
    exp: now + personalSpaceTokenTtlSeconds
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = await signTokenPayload(payloadPart);
  return {
    token: `${payloadPart}.${signaturePart}`,
    expiresAt: payload.exp * 1000
  };
}

async function verifyPersonalSpaceToken(request: Request) {
  if (!personalSpaceTokenSecret) return false;

  const token = request.headers.get('x-personal-token') || '';
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const expectedSignature = await signTokenPayload(parts[0]);
  if (!timingSafeEqual(parts[1], expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload?.scope === 'personal-space'
      && typeof payload.exp === 'number'
      && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

async function assertPersonalSpaceToken(request: Request) {
  if (await verifyPersonalSpaceToken(request)) return;

  throw new Response(JSON.stringify({ error: 'Personal Space unlock required.' }), {
    status: 401,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}

async function getQuotes(stocks: Stock[]) {
  if (stocks.length === 0) return {};
  const entries = await Promise.all(stocks.map(async (stock) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.symbol)}?interval=1d&range=2y`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const history = timestamps
      .map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close: closes[index]
      }))
      .filter((item: { date: string; close: unknown }): item is PricePoint => (
        typeof item.close === 'number' && Number.isFinite(item.close)
      ));
    const lastClose = history.length > 0 ? history[history.length - 1].close : null;
    const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : lastClose;
    if (!price) return null;
    return [
      stock.symbol,
      {
        price,
        marketTime: meta.regularMarketTime,
        currency: meta.currency,
        history
      }
    ];
  }));

  return Object.fromEntries(entries.filter(Boolean) as [string, unknown][]);
}

function cleanInvestmentSymbol(value: unknown) {
  const symbol = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (['SP500', 'S&P500', 'S&P', 'SPX'].includes(symbol)) return 'SPY';
  return symbol;
}

function parseIsoDate(value: unknown) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function pickInvestmentRows(rows: InvestmentPricePoint[], startDate: Date, endDate: Date) {
  const usableRows = rows
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);
  const purchase = usableRows.find((row) => row.date >= startKey);
  const current = [...usableRows].reverse().find((row) => row.date <= endKey);

  if (!purchase || !current) {
    throw new Error('No price history found for that ticker and date range.');
  }

  return { purchase, current };
}

function pickCpiForYear(series: InflationPoint[], year: number, latest: InflationPoint) {
  if (year > latest.year) return latest;

  const atOrBefore = [...series].reverse().find((item) => item.year <= year);
  return atOrBefore || series[0];
}

async function getInvestmentInflation(startDate: Date, endDate = new Date()) {
  const url = 'https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json&per_page=100';
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error('Inflation data is unavailable.');
  }

  const rows = Array.isArray(data?.[1]) ? data[1] : [];
  const series = rows
    .filter((row: { value?: unknown }) => row.value !== null && row.value !== undefined && row.value !== '')
    .map((row: { date?: unknown; value?: unknown }) => ({
      year: Number(row.date),
      value: Number(row.value)
    }))
    .filter((row: InflationPoint) => Number.isFinite(row.year) && Number.isFinite(row.value))
    .sort((a: InflationPoint, b: InflationPoint) => a.year - b.year);

  if (series.length === 0) {
    throw new Error('Inflation data is unavailable.');
  }

  const latest = series[series.length - 1];
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  const start = pickCpiForYear(series, startYear, latest);
  const end = pickCpiForYear(series, endYear, latest);
  const factor = end.value / start.value;

  return {
    factor,
    start,
    latest: end,
    source: `World Bank CPI ${start.year}-${end.year}`
  };
}

async function getInvestmentHistory(symbol: string, startDate: Date, endDate: Date) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(unixSeconds(startDate)));
  url.searchParams.set('period2', String(unixSeconds(addUtcDays(endDate, 2))));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');
  url.searchParams.set('includeAdjustedClose', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.chart?.error?.description || 'Price data is unavailable.');
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(data?.chart?.error?.description || 'No price history found for that ticker.');
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  const hasAdjusted = adjusted.some((price: unknown) => typeof price === 'number' && Number.isFinite(price));
  const rows = timestamps.map((timestamp: number, index: number) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    price: hasAdjusted ? adjusted[index] : closes[index]
  }));
  const prices = pickInvestmentRows(rows, startDate, endDate);
  const meta = result.meta || {};
  const inflation = await getInvestmentInflation(startDate, prices.current.date ? parseIsoDate(prices.current.date) || endDate : endDate).catch(() => null);

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    source: hasAdjusted ? 'Yahoo Finance adjusted close' : 'Yahoo Finance close',
    purchase: prices.purchase,
    current: prices.current,
    inflation
  };
}

async function listPortfolio() {
  const stocks = await supabase('portfolio_stocks?select=*&order=symbol.asc') as Stock[];
  const logs = await supabase('portfolio_logs?select=*&order=logged_at.desc,created_at.desc');
  const quotes = await getQuotes(stocks);
  return { stocks, logs, quotes };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return json({ ok: true });
  }

  try {
    const body = await request.json().catch(() => ({})) as PortfolioBody;

    if (body.action === 'unlockPersonal') {
      if (!personalSpacePassword) return json({ error: 'Personal Space password is not configured.' }, 500);
      if (body.password !== personalSpacePassword) return json({ error: 'Incorrect password.' }, 401);
      return json(await createPersonalSpaceToken());
    }

    if (body.action === 'investmentHistory') {
      const symbol = cleanInvestmentSymbol(body.symbol);
      const startDate = parseIsoDate(body.start_date);
      const endDate = body.end_date ? parseIsoDate(body.end_date) : new Date();

      if (!symbol) return json({ error: 'Ticker symbol is required.' }, 400);
      if (!startDate) return json({ error: 'Choose a valid investment date.' }, 400);
      if (!endDate) return json({ error: 'Choose a valid end date.' }, 400);
      if (startDate > new Date() || endDate > new Date()) return json({ error: 'Choose dates that have already happened.' }, 400);
      if (endDate < startDate) return json({ error: 'Choose an end date after the investment date.' }, 400);

      return json(await getInvestmentHistory(symbol, startDate, endDate));
    }

    if (body.action === 'inflationData') {
      const startDate = parseIsoDate(body.start_date);
      const endDate = body.end_date ? parseIsoDate(body.end_date) : new Date();

      if (!startDate) return json({ error: 'Choose a valid start date.' }, 400);
      if (!endDate) return json({ error: 'Choose a valid end date.' }, 400);
      if (startDate > new Date() || endDate > new Date()) return json({ error: 'Choose dates that have already happened.' }, 400);
      if (endDate < startDate) return json({ error: 'Choose an end date after the start date.' }, 400);

      return json(await getInvestmentInflation(startDate, endDate));
    }

    await assertPersonalSpaceToken(request);

    if (body.action === 'list') {
      return json(await listPortfolio());
    }

    if (body.action === 'addStock') {
      const symbol = body.symbol?.trim().toUpperCase();
      if (!symbol) return json({ error: 'Ticker symbol is required.' }, 400);
      await supabase('portfolio_stocks', {
        method: 'POST',
        body: JSON.stringify({ symbol, name: body.name?.trim() || null })
      });
      return json(await listPortfolio());
    }

    if (body.action === 'addLog') {
      if (!body.stock_id || !body.logged_at || !body.entry_type || !body.purchase_price || !body.total_purchase_amount) {
        return json({ error: 'Every log field is required.' }, 400);
      }
      if (body.purchase_price <= 0 || body.total_purchase_amount <= 0) {
        return json({ error: 'Purchase price and amount must be greater than zero.' }, 400);
      }
      await supabase('portfolio_logs', {
        method: 'POST',
        body: JSON.stringify({
          stock_id: body.stock_id,
          logged_at: body.logged_at,
          entry_type: body.entry_type,
          purchase_price: body.purchase_price,
          total_purchase_amount: body.total_purchase_amount
        })
      });
      return json(await listPortfolio());
    }

    if (body.action === 'deleteStock' && body.id) {
      await supabase(`portfolio_stocks?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
      return json(await listPortfolio());
    }

    if (body.action === 'deleteLog' && body.id) {
      await supabase(`portfolio_logs?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
      return json(await listPortfolio());
    }

    return json({ error: 'Unknown portfolio action.' }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : 'Unexpected portfolio error.' }, 500);
  }
});
