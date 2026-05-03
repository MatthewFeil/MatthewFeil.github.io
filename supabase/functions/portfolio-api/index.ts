const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portfolio-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const portfolioPassword = Deno.env.get('PORTFOLIO_PASSWORD') || '';

type Stock = {
  id: string;
  symbol: string;
  name: string | null;
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

function assertPassword(request: Request) {
  if (request.headers.get('x-portfolio-password') !== portfolioPassword) {
    throw new Response(JSON.stringify({ error: 'Incorrect password.' }), {
      status: 401,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    });
  }
}

async function getQuotes(stocks: Stock[]) {
  if (stocks.length === 0) return {};
  const entries = await Promise.all(stocks.map(async (stock) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.symbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return [
      stock.symbol,
      {
        price: meta.regularMarketPrice,
        marketTime: meta.regularMarketTime,
        currency: meta.currency
      }
    ];
  }));

  return Object.fromEntries(entries.filter(Boolean) as [string, unknown][]);
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
    assertPassword(request);
    const body = await request.json().catch(() => ({})) as PortfolioBody;

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
