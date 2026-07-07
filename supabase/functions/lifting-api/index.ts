import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  jsonResponse,
  optionsResponse,
  requireAllowedOrigin,
  verifyPersonalSpaceToken,
} from "../_shared/personal-security.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const personalSpaceTokenSecret = Deno.env.get("PERSONAL_SPACE_TOKEN_SECRET") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

function cleanName(name: unknown) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function cleanNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  const originError = requireAllowedOrigin(req);
  if (originError) return originError;

  const json = (body: Record<string, unknown>, status = 200) => jsonResponse(req, body, status);

  if (req.method === "GET" || req.method === "HEAD") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const unlocked = await verifyPersonalSpaceToken(req, personalSpaceTokenSecret);
  if (!unlocked) return json({ error: "Personal Space unlock required." }, 401);

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

    if (action === "renameLift") {
      const id = String(body.id || "");
      const name = cleanName(body.name);
      if (!id) return json({ error: "Choose a lift." }, 400);
      if (!name) return json({ error: "Lift name is required." }, 400);
      const { data, error } = await supabase
        .from("lifting_lifts")
        .update({ name })
        .eq("id", id)
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
