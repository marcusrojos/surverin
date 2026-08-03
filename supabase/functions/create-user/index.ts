import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/credentials-crypto.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email?: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "livreur" | "pharmacie";
  pharmacy_id?: string;
  username?: string;
  site_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .single();

    const callerRole = roleData?.role;
    if (roleError || (callerRole !== "admin" && callerRole !== "super_admin")) {
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, role, pharmacy_id, username, site_id }: CreateUserRequest = await req.json();

    if (!password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email is optional: username is the primary login identifier.
    const trimmedEmail = email?.trim() || "";
    const trimmedUsername = username?.trim() || "";
    if (!trimmedEmail && !trimmedUsername) {
      return new Response(
        JSON.stringify({ error: "Un nom d'utilisateur ou un email est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth requires an email; when none is provided, derive a synthetic login email from the username.
    const sanitizedUsername = trimmedUsername.toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const authEmail = trimmedEmail || `${sanitizedUsername || crypto.randomUUID()}@dpci.local`;

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only super_admin can create super_admin accounts
    if (role === "super_admin" && callerRole !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only a super admin can create a super administrator" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve the site the new user belongs to
    let targetSiteId: string | null = null;
    if (role === "super_admin") {
      // Super admins are global: no site assignment
      targetSiteId = null;
    } else if (callerRole === "super_admin") {
      // Super admin must specify the site for admins and drivers
      targetSiteId = site_id ?? null;
      if (!targetSiteId) {
        return new Response(
          JSON.stringify({ error: "site_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Regular admin: force the new user onto the admin's own site
      const { data: adminProfile } = await adminClient
        .from("profiles")
        .select("site_id")
        .eq("user_id", callerUser.id)
        .single();
      targetSiteId = adminProfile?.site_id ?? null;
    }

    if (role === "pharmacie" && !pharmacy_id) {
      return new Response(
        JSON.stringify({ error: "pharmacy_id is required when creating a pharmacy user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (role === "pharmacie" && pharmacy_id) {
      const { data: pharmacyData, error: pharmacyError } = await adminClient
        .from("pharmacies")
        .select("id, user_id, name")
        .eq("id", pharmacy_id)
        .single();

      if (pharmacyError || !pharmacyData) {
        return new Response(
          JSON.stringify({ error: "Pharmacy not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pharmacyData.user_id) {
        return new Response(
          JSON.stringify({ error: "This pharmacy already has a user account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enforce site isolation: pharmacy must belong to the target site (unless super admin)
      const { data: pharmacySite } = await adminClient
        .from("pharmacies")
        .select("site_id")
        .eq("id", pharmacy_id)
        .single();
      if (callerRole !== "super_admin" && pharmacySite?.site_id !== targetSiteId) {
        return new Response(
          JSON.stringify({ error: "Pharmacy does not belong to your site" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });

    if (createError) {
      console.error("Auth error:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // Create profile
    const profileData: any = {
      user_id: newUserId,
      full_name: full_name.trim(),
      email: authEmail,
      site_id: targetSiteId,
    };
    if (trimmedUsername) {
      profileData.username = trimmedUsername;
    }
    const { error: profileError } = await adminClient.from("profiles").insert(profileData);

    if (profileError) {
      console.error("Profile error:", profileError);
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create role
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: newUserId,
      role: role,
    });

    if (roleInsertError) {
      console.error("Role error:", roleInsertError);
      await adminClient.from("profiles").delete().eq("user_id", newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Failed to create role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Link pharmacy to user if role is pharmacie
    if (role === "pharmacie" && pharmacy_id) {
      const { error: pharmacyUpdateError } = await adminClient
        .from("pharmacies")
        .update({ user_id: newUserId })
        .eq("id", pharmacy_id);

      if (pharmacyUpdateError) {
        console.error("Pharmacy link error:", pharmacyUpdateError);
        await adminClient.from("user_roles").delete().eq("user_id", newUserId);
        await adminClient.from("profiles").delete().eq("user_id", newUserId);
        await adminClient.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({ error: "Failed to link pharmacy to user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`User created successfully: ${email} with role ${role}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUserId, 
          email: authData.user.email,
          full_name: full_name.trim(),
          role: role,
          site_id: targetSiteId,
          pharmacy_id: role === "pharmacie" ? pharmacy_id : undefined
        } 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
