import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lifting-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function assertPassword(req: Request) {
  const password = req.headers.get("x-lifting-password") || "";
  if (!password) return false;

  const { data, error } = await supabase
    .from("lifting_app_settings")
    .select("password_salt,password_hash")
    .eq("id", true)
    .single();

  if (error || !data) return false;
  const candidate = await sha256Hex(`${data.password_salt}${password}`);
  return candidate === data.password_hash;
}

function cleanName(name: unknown) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function cleanNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const unlocked = await assertPassword(req);
  if (!unlocked) return json({ error: "Incorrect password." }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  try {
    if (action === "list") {
      const [{ data: lifts, error: liftsError }, { data: logs, error: logsError }] = await Promise.all([
        supabase.from("lifting_lifts").select("id,name,created_at").order("name", { ascending: true }),
        supabase
          .from("lifting_logs")
          .select("id,lift_id,lifted_at,weight,reps,notes,created_at")
          .order("lifted_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (liftsError) throw liftsError;
      if (logsError) throw logsError;
      return json({ lifts: lifts || [], logs: logs || [] });
    }

    if (action === "addLift") {
      const name = cleanName(body.name);
      if (!name) return json({ error: "Lift name is required." }, 400);
      const { data, error } = await supabase
        .from("lifting_lifts")
        .insert({ name })
        .select("id,name,created_at")
        .single();
      if (error) throw error;
      return json({ lift: data });
    }

    if (action === "addLog") {
      const weight = cleanNumber(body.weight);
      const reps = Math.trunc(cleanNumber(body.reps));
      const liftId = String(body.lift_id || "");
      const liftedAt = String(body.lifted_at || new Date().toISOString().slice(0, 10));
      const notes = String(body.notes || "").trim();

      if (!liftId) return json({ error: "Choose a lift." }, 400);
      if (!Number.isFinite(weight) || weight <= 0) return json({ error: "Enter a positive weight." }, 400);
      if (!Number.isInteger(reps) || reps < 1 || reps > 10) {
        return json({ error: "Reps must be between 1 and 10." }, 400);
      }

      const { data, error } = await supabase
        .from("lifting_logs")
        .insert({ lift_id: liftId, lifted_at: liftedAt, weight, reps, notes })
        .select("id,lift_id,lifted_at,weight,reps,notes,created_at")
        .single();
      if (error) throw error;
      return json({ log: data });
    }

    if (action === "deleteLog") {
      const { error } = await supabase.from("lifting_logs").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "deleteLift") {
      const { error } = await supabase.from("lifting_lifts").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return json({ error: message }, 500);
  }
});
