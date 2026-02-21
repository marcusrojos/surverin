import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "livreur" | "pharmacie";
  pharmacy_id?: string;
  username?: string;
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

    // Verify caller is admin
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

    if (roleError || roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, role, pharmacy_id, username }: CreateUserRequest = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    }

    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
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
      email: email.trim(),
      plain_password: password,
    };
    if (username) {
      profileData.username = username.trim();
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
