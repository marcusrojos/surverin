import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: callerRole } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).maybeSingle()
    if (!callerRole || (callerRole.role !== 'admin' && callerRole.role !== 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const isSuperAdmin = callerRole.role === 'super_admin'

    const { userId } = await req.json()
    if (!userId) return new Response(JSON.stringify({ error: 'userId requis' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Enforce site isolation: a regular admin can only delete users from their own site
    if (!isSuperAdmin) {
      const [{ data: callerProfile }, { data: targetProfile }] = await Promise.all([
        supabaseAdmin.from('profiles').select('site_id').eq('user_id', caller.id).maybeSingle(),
        supabaseAdmin.from('profiles').select('site_id').eq('user_id', userId).maybeSingle(),
      ])
      if (!targetProfile || !callerProfile || targetProfile.site_id !== callerProfile.site_id) {
        return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Clean up related data
    await supabaseAdmin.from('deliveries').update({ driver_id: null }).eq('driver_id', userId)
    await supabaseAdmin.from('pharmacies').update({ user_id: null }).eq('user_id', userId)
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
    await supabaseAdmin.from('profiles').delete().eq('user_id', userId)


    // Delete auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
