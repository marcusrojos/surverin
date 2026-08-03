import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/credentials-crypto.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Non autorisé");

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRole = roleData?.role;
    if (callerRole !== "admin" && callerRole !== "super_admin") throw new Error("Accès refusé");

    const { user_id, password } = await req.json();
    if (!user_id || !password) throw new Error("user_id et password requis");
    if (password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères");

    // Enforce site isolation: a regular admin can only reset passwords for users on their own site
    if (callerRole !== "super_admin") {
      const [{ data: callerProfile }, { data: targetProfile }] = await Promise.all([
        supabaseAdmin.from("profiles").select("site_id").eq("user_id", caller.id).maybeSingle(),
        supabaseAdmin.from("profiles").select("site_id").eq("user_id", user_id).maybeSingle(),
      ]);
      if (!targetProfile || !callerProfile || targetProfile.site_id !== callerProfile.site_id) {
        throw new Error("Accès refusé");
      }
    }

    // Update auth password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
    if (updateError) throw updateError;

    // Keep the secure credentials archive in sync (encrypted at rest).
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, username, email, site_id")
        .eq("user_id", user_id)
        .maybeSingle();
      const { data: targetRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .maybeSingle();

      if (profile && targetRole) {
        await supabaseAdmin.from("user_credentials").upsert(
          {
            user_id,
            full_name: profile.full_name,
            role: targetRole.role,
            site_id: profile.site_id,
            identifier: profile.username || profile.email,
            password_encrypted: await encryptSecret(password),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      }
    } catch (e) {
      console.error("Credentials archive update failed:", e);
    }






    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
