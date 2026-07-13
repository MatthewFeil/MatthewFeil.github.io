type InvestmentPricePoint = {
  date: string;
  price: number;
};

type InflationPoint = {
  year: number;
  value: number;
};

export function cleanInvestmentSymbol(value: unknown) {
  const symbol = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (["SP500", "S&P500", "S&P", "SPX"].includes(symbol)) return "SPY";
  return symbol;
}

export function parseIsoDate(value: unknown) {
  const text = String(value || "");
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
  ) return null;
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
    .sort((left, right) => left.date.localeCompare(right.date));
  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);
  const purchase = usableRows.find((row) => row.date >= startKey);
  const current = [...usableRows].reverse().find((row) => row.date <= endKey);

  if (!purchase || !current) {
    throw new Error("No price history found for that ticker and date range.");
  }
  return { purchase, current };
}

function pickCpiForYear(series: InflationPoint[], year: number, latest: InflationPoint) {
  if (year > latest.year) return latest;
  return [...series].reverse().find((item) => item.year <= year) || series[0];
}

export async function getInvestmentInflation(startDate: Date, endDate = new Date()) {
  const response = await fetch(
    "https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json&per_page=100",
    { headers: { "user-agent": "Mozilla/5.0" } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Inflation data is unavailable.");

  const rows = Array.isArray(data?.[1]) ? data[1] : [];
  const series = rows
    .filter((row: { value?: unknown }) => row.value !== null && row.value !== undefined && row.value !== "")
    .map((row: { date?: unknown; value?: unknown }) => ({
      year: Number(row.date),
      value: Number(row.value),
    }))
    .filter((row: InflationPoint) => Number.isFinite(row.year) && Number.isFinite(row.value))
    .sort((left: InflationPoint, right: InflationPoint) => left.year - right.year);

  if (series.length === 0) throw new Error("Inflation data is unavailable.");

  const latest = series[series.length - 1];
  const start = pickCpiForYear(series, startDate.getUTCFullYear(), latest);
  const end = pickCpiForYear(series, endDate.getUTCFullYear(), latest);
  return {
    factor: end.value / start.value,
    start,
    latest: end,
    source: `World Bank CPI ${start.year}-${end.year}`,
  };
}

export async function getInvestmentHistory(symbol: string, startDate: Date, endDate: Date) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(unixSeconds(startDate)));
  url.searchParams.set("period2", String(unixSeconds(addUtcDays(endDate, 2))));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "history");
  url.searchParams.set("includeAdjustedClose", "true");

  const response = await fetch(url.toString(), {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.chart?.error?.description || "Price data is unavailable.");
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(data?.chart?.error?.description || "No price history found for that ticker.");
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  const hasAdjusted = adjusted.some((price: unknown) => typeof price === "number" && Number.isFinite(price));
  const rows = timestamps.map((timestamp: number, index: number) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    price: hasAdjusted ? adjusted[index] : closes[index],
  }));
  const prices = pickInvestmentRows(rows, startDate, endDate);
  const meta = result.meta || {};
  const currentDate = parseIsoDate(prices.current.date) || endDate;
  const inflation = await getInvestmentInflation(startDate, currentDate).catch(() => null);

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    source: hasAdjusted ? "Yahoo Finance adjusted close" : "Yahoo Finance close",
    purchase: prices.purchase,
    current: prices.current,
    inflation,
  };
}
