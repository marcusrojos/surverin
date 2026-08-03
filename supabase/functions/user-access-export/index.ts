import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/credentials-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await admin.auth.getUser(token);
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    const callerRole = roleData?.role;
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      return json({ error: "Accès réservé aux administrateurs" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const password: string = typeof body?.password === "string" ? body.password : "";
    const requestedSiteId: string | null =
      typeof body?.site_id === "string" && body.site_id !== "all" ? body.site_id : null;

    if (!password) return json({ error: "Mot de passe requis" }, 400);

    // Re-validate the administrator's identity with their own password.
    const authClient = createClient(supabaseUrl, anonKey);
    const { error: reauthError } = await authClient.auth.signInWithPassword({
      email: caller.email!,
      password,
    });
    if (reauthError) return json({ error: "Mot de passe incorrect" }, 403);
    await authClient.auth.signOut();

    // Site isolation: a regular admin only ever sees their own site.
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("site_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    let query = admin
      .from("user_credentials")
      .select("user_id, full_name, role, site_id, identifier, password_encrypted, updated_at")
      .order("full_name");

    let scopeSiteId: string | null = null;
    if (callerRole === "super_admin") {
      scopeSiteId = requestedSiteId;
      if (scopeSiteId) query = query.eq("site_id", scopeSiteId);
    } else {
      scopeSiteId = callerProfile?.site_id ?? null;
      if (!scopeSiteId) return json({ error: "Aucun site associé à votre compte" }, 403);
      query = query.eq("site_id", scopeSiteId);
    }

    const { data: rows, error: rowsError } = await query;
    if (rowsError) {
      console.error("Credentials read error:", rowsError);
      return json({ error: "Lecture impossible" }, 500);
    }

    const sites = new Map<string, string>();
    const { data: siteRows } = await admin.from("sites").select("id, name");
    (siteRows ?? []).forEach((s: any) => sites.set(s.id, s.name));

    const credentials: unknown[] = [];
    for (const row of rows ?? []) {
      let plain = "";
      try {
        plain = await decryptSecret(row.password_encrypted);
      } catch (e) {
        console.error("Decrypt failed for user", row.user_id, e);
        continue;
      }
      credentials.push({
        user_id: row.user_id,
        full_name: row.full_name,
        role: row.role,
        site_id: row.site_id,
        site_name: row.site_id ? sites.get(row.site_id) ?? null : null,
        identifier: row.identifier,
        password: plain,
        updated_at: row.updated_at,
      });
    }

    // Inviolable audit trail of every access to the credentials archive.
    const { data: actorProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    await admin.from("audit_logs").insert({
      action: "consultation",
      entity_type: "user_credentials",
      entity_id: null,
      entity_label: `Export des accès (${credentials.length} compte(s))`,
      actor_id: caller.id,
      actor_name: actorProfile?.full_name ?? caller.email,
      site_id: scopeSiteId,
      details: { count: credentials.length, scope: scopeSiteId ?? "all" },
    });

    return json({ success: true, credentials });
  } catch (error) {
    console.error("Unexpected error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
