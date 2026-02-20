import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: callerRole } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).maybeSingle()
    if (!callerRole || callerRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email, password, fullName, username, role, pharmacyId } = await req.json()

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message || 'Erreur création' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId = newUser.user.id

    // Create profile and role
    await supabaseAdmin.from('profiles').insert({
      user_id: userId,
      email,
      full_name: fullName,
      username: username || null,
      plain_password: password,
    })

    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: role || 'livreur',
    })

    // Link pharmacy if needed
    if (role === 'pharmacie' && pharmacyId) {
      await supabaseAdmin.from('pharmacies').update({ user_id: userId }).eq('id', pharmacyId)
    }

    return new Response(JSON.stringify({ success: true, userId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
