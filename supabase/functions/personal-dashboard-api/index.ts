import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  base64UrlEncode,
  jsonResponse,
  optionsResponse,
  requireAllowedOrigin,
  verifyPersonalSpaceToken,
} from "../_shared/personal-security.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const personalSpaceTokenSecret = Deno.env.get("PERSONAL_SPACE_TOKEN_SECRET") || "";
const googleServiceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
const googleCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
const googleCalendarIds = (Deno.env.get("GOOGLE_CALENDAR_IDS") || "")
  .split(",")
  .map((calendarId) => calendarId.trim())
  .filter(Boolean);
const dashboardTimeZone = Deno.env.get("DASHBOARD_TIME_ZONE") || "America/Chicago";
const todoistApiToken = Deno.env.get("TODOIST_API_TOKEN") || "";

type DashboardBody = {
  action?: string;
  taskId?: string;
};

type GoogleCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type PortfolioStock = {
  id: string;
  symbol: string;
};

type PortfolioLog = {
  stock_id: string;
  entry_type: string;
  purchase_price: number;
  total_purchase_amount: number;
};

type TodoistTask = {
  id: string;
  content: string;
  description?: string;
  due?: {
    date?: string;
    datetime?: string;
    string?: string;
    timezone?: string;
  };
  priority?: number;
  project_id?: string;
  url?: string;
};

type TodoistProject = {
  id: string;
  name: string;
  parent_id?: string | null;
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
  if (!response.ok) {
    throw new Error(data?.message || "Database request failed.");
  }
  return data;
}

function sharesForLog(log: PortfolioLog) {
  return Number(log.total_purchase_amount) / Number(log.purchase_price);
}

async function getQuotes(stocks: PortfolioStock[]) {
  if (stocks.length === 0) return {};

  const entries = await Promise.all(stocks.map(async (stock) => {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.symbol)}?interval=1d&range=5d`,
      { headers: { "user-agent": "Mozilla/5.0" } },
    );
    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const lastClose = [...closes].reverse().find((value) => typeof value === "number" && Number.isFinite(value));
    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : lastClose;
    if (!price) return null;

    return [stock.symbol, price] as const;
  }));

  return Object.fromEntries(entries.filter(Boolean) as [string, number][]);
}

async function getPortfolioSummary() {
  if (!supabaseUrl || !serviceRoleKey) return { totalValue: 0, gain: 0, gainPercent: 0 };

  const stocks = await supabase("portfolio_stocks?select=id,symbol&order=symbol.asc") as PortfolioStock[];
  const logs = await supabase("portfolio_logs?select=stock_id,entry_type,purchase_price,total_purchase_amount") as PortfolioLog[];
  const quotes = await getQuotes(stocks);

  const metrics = stocks.map((stock) => {
    const stockLogs = logs.filter((log) => log.stock_id === stock.id);
    const costBasis = stockLogs.reduce((sum, log) => {
      if (log.entry_type === "reinvested_dividend") return sum;
      return sum + Number(log.total_purchase_amount);
    }, 0);
    const shares = stockLogs.reduce((sum, log) => sum + sharesForLog(log), 0);
    const totalValue = shares * Number(quotes[stock.symbol] || 0);
    return { costBasis, totalValue };
  });

  const totalValue = metrics.reduce((sum, item) => sum + item.totalValue, 0);
  const costBasis = metrics.reduce((sum, item) => sum + item.costBasis, 0);
  const gain = totalValue - costBasis;
  const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  return { totalValue, gain, gainPercent };
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signGoogleJwt(credentials: GoogleCredentials, payloadPart: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(payloadPart));
  return base64UrlEncode(signature);
}

async function getGoogleAccessToken() {
  if (!googleServiceAccountJson) {
    throw new Error("Google service account secret is not configured.");
  }

  const credentials = JSON.parse(googleServiceAccountJson) as GoogleCredentials;
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signature = await signGoogleJwt(credentials, `${header}.${payload}`);
  const assertion = `${header}.${payload}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token request failed.");
  }

  return data.access_token as string;
}

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(target);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = partsInTimeZone(guess, timeZone);
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess = new Date(guess.getTime() - (rendered - target));
  }

  return guess;
}

function todayRange(timeZone: string) {
  const parts = partsInTimeZone(new Date(), timeZone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    start: zonedTimeToUtc(year, month, day, 0, 0, timeZone),
    end: zonedTimeToUtc(year, month, day + 1, 0, 0, timeZone),
  };
}

function localDateString(timeZone: string) {
  const parts = partsInTimeZone(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatClockTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatEventTime(event: Record<string, unknown>, timeZone: string) {
  const start = event.start as Record<string, string> | undefined;
  if (start?.date) return "All day";
  const startDate = start?.dateTime ? new Date(start.dateTime) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(startDate);
}

function eventStartTime(event: Record<string, unknown>) {
  const start = event.start as Record<string, string> | undefined;
  if (start?.dateTime) return new Date(start.dateTime).getTime();
  if (start?.date) return new Date(`${start.date}T00:00:00`).getTime();
  return Number.MAX_SAFE_INTEGER;
}

async function getReadableCalendarIds(accessToken: string): Promise<string[]> {
  if (googleCalendarIds.length > 0) return googleCalendarIds;

  const params = new URLSearchParams({
    minAccessRole: "reader",
    showHidden: "true",
    maxResults: "250",
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [googleCalendarId];

  const calendarIds = (data.items || [])
    .map((calendar: Record<string, unknown>) => String(calendar.id || ""))
    .filter(Boolean);

  return calendarIds.length > 0 ? calendarIds : [googleCalendarId];
}

async function getCalendarEventsForCalendar(accessToken: string, calendarId: string, start: Date, end: Date) {
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "8",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Google Calendar request failed.");
  }

  return (data.items || []).map((event: Record<string, unknown>) => ({
    id: String(event.id || ""),
    calendarId,
    sortTime: eventStartTime(event),
    time: formatEventTime(event, dashboardTimeZone),
    title: String(event.summary || "Untitled event"),
    detail: String(event.location || event.description || ""),
    url: String(event.htmlLink || "https://calendar.google.com/calendar/u/0/r/day"),
  }));
}

async function getCalendarEvents() {
  const { start, end } = todayRange(dashboardTimeZone);
  const accessToken = await getGoogleAccessToken();
  const calendarIds = await getReadableCalendarIds(accessToken);
  const results = await Promise.allSettled(
    calendarIds.map((calendarId) => getCalendarEventsForCalendar(accessToken, calendarId, start, end)),
  );

  return results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((left, right) => left.sortTime - right.sortTime)
    .slice(0, 8)
    .map(({ sortTime: _sortTime, ...event }) => event);
}

async function todoist(path: string, init: RequestInit = {}) {
  if (!todoistApiToken) {
    throw new Error("Todoist API token is not configured.");
  }

  const response = await fetch(`https://api.todoist.com/api/v1/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${todoistApiToken}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Todoist request failed.");
  }
  return data;
}

async function getTodoistTasks() {
  const date = localDateString(dashboardTimeZone);
  const params = new URLSearchParams({
    query: "today",
    limit: "50",
  });
  const [taskData, projectMap] = await Promise.all([
    todoist(`tasks/filter?${params}`) as Promise<{ results?: TodoistTask[] }>,
    getTodoistProjectMap(),
  ]);

  return (taskData.results || [])
    .filter((task) => todoistDueDate(task) === date)
    .sort(compareTodoistTasks)
    .slice(0, 8)
    .map((task) => formatTodoistTask(task, projectMap));
}

async function getTodoistProjectMap() {
  const data = await todoist("projects?limit=200") as { results?: TodoistProject[] } | TodoistProject[];
  const projects = Array.isArray(data) ? data : data.results || [];
  return new Map(projects.map((project) => [String(project.id), project]));
}

function todoistDueDate(task: TodoistTask) {
  const value = task.due?.datetime || task.due?.date || "";
  return value.slice(0, 10);
}

function todoistDueDateTime(task: TodoistTask) {
  const value = task.due?.datetime || "";
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareTodoistTasks(left: TodoistTask, right: TodoistTask) {
  const leftDate = todoistDueDateTime(left);
  const rightDate = todoistDueDateTime(right);

  if (leftDate && rightDate) {
    return leftDate.getTime() - rightDate.getTime() ||
      Number(right.priority || 1) - Number(left.priority || 1);
  }

  if (leftDate) return -1;
  if (rightDate) return 1;

  return Number(right.priority || 1) - Number(left.priority || 1);
}

function todoistProjectPath(projectId: string | undefined, projectMap: Map<string, TodoistProject>) {
  if (!projectId) return "";

  const names: string[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined | null = projectId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const project = projectMap.get(currentId);
    if (!project) break;
    names.unshift(project.name);
    currentId = project.parent_id || null;
  }

  return names.join(" / ");
}

function formatTodoistTask(task: TodoistTask, projectMap: Map<string, TodoistProject>) {
  const priority = Number(task.priority || 1);
  const dueDateTime = todoistDueDateTime(task);
  const time = dueDateTime ? formatClockTime(dueDateTime, dashboardTimeZone) : "";
  const projectPath = todoistProjectPath(task.project_id, projectMap);
  const details = [
    time,
    task.description || "",
    projectPath,
  ].filter(Boolean);

  return {
    id: String(task.id),
    title: task.content || "Untitled task",
    details,
    time,
    priority,
    priorityClass: `p${Math.max(1, Math.min(4, priority))}`,
    url: task.url || `https://todoist.com/app/task/${encodeURIComponent(String(task.id))}`,
  };
}

async function completeTodoistTask(taskId: string) {
  if (!taskId) {
    throw new Error("Todoist task ID is required.");
  }

  await todoist(`tasks/${encodeURIComponent(taskId)}/close`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function dashboardSummary() {
  const [portfolio, calendarResult, todoistResult] = await Promise.allSettled([
    getPortfolioSummary(),
    getCalendarEvents(),
    getTodoistTasks(),
  ]);

  return {
    portfolio: portfolio.status === "fulfilled" ? portfolio.value : { totalValue: 0, gain: 0, gainPercent: 0 },
    calendar: calendarResult.status === "fulfilled" ? calendarResult.value : [],
    todoist: todoistResult.status === "fulfilled" ? todoistResult.value : [],
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const originError = requireAllowedOrigin(request);
  if (originError) return originError;

  const json = (body: unknown, status = 200) => jsonResponse(request, body, status);

  if (request.method === "GET" || request.method === "HEAD") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const unlocked = await verifyPersonalSpaceToken(request, personalSpaceTokenSecret);
    if (!unlocked) return json({ error: "Personal Space unlock required." }, 401);

    const body = await request.json().catch(() => ({})) as DashboardBody;

    if (!body.action || body.action === "summary") {
      return json(await dashboardSummary());
    }

    if (body.action === "completeTodoistTask") {
      await completeTodoistTask(body.taskId || "");
      return json({ ok: true });
    }

    return json({ error: "Unknown dashboard action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected dashboard error." }, 500);
  }
});
