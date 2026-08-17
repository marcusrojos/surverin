import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)
    const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) return json({ error: 'Non autorisé' }, 401)

    const { data: callerRole } = await admin.from('user_roles').select('role').eq('user_id', caller.id).maybeSingle()
    if (callerRole?.role !== 'super_admin') return json({ error: 'Accès refusé' }, 403)

    const { siteId } = await req.json()
    if (!siteId) return json({ error: 'siteId requis' }, 400)

    // 1. Collect related entities
    const [{ data: parcoursRows }, { data: pharmacyRows }, { data: axisRows }, { data: profileRows }] = await Promise.all([
      admin.from('parcours').select('id').eq('site_id', siteId),
      admin.from('pharmacies').select('id').eq('site_id', siteId),
      admin.from('axes').select('id').eq('site_id', siteId),
      admin.from('profiles').select('user_id').eq('site_id', siteId),
    ])

    const parcoursIds = (parcoursRows || []).map((p: any) => p.id)
    const pharmacyIds = (pharmacyRows || []).map((p: any) => p.id)
    const axisIds = (axisRows || []).map((a: any) => a.id)
    const userIds = (profileRows || []).map((p: any) => p.user_id)

    // 2. Parcours children
    if (parcoursIds.length) {
      const { data: invRows } = await admin.from('parcours_inventaire').select('id').in('parcours_id', parcoursIds)
      const invIds = (invRows || []).map((i: any) => i.id)
      if (invIds.length) await admin.from('parcours_inventaire_scans').delete().in('inventaire_id', invIds)
      await admin.from('parcours_inventaire').delete().in('parcours_id', parcoursIds)
      await admin.from('parcours_colis').delete().in('parcours_id', parcoursIds)
      await admin.from('parcours_pharmacies').delete().in('parcours_id', parcoursIds)
    }

    // 3. Deliveries then parcours
    await admin.from('deliveries').delete().eq('site_id', siteId)
    if (pharmacyIds.length) await admin.from('deliveries').delete().in('pharmacy_id', pharmacyIds)
    if (parcoursIds.length) await admin.from('parcours').delete().in('id', parcoursIds)

    // 4. Axes
    if (axisIds.length) {
      await admin.from('axis_pharmacies').delete().in('axis_id', axisIds)
      await admin.from('axes').delete().in('id', axisIds)
    }

    // 5. Pharmacies
    if (pharmacyIds.length) {
      await admin.from('axis_pharmacies').delete().in('pharmacy_id', pharmacyIds)
      await admin.from('pharmacy_bacs_balance').delete().in('pharmacy_id', pharmacyIds)
      await admin.from('pharmacies').delete().in('id', pharmacyIds)
    }

    // 6. Users of the site (accounts fully removed => no login possible)
    for (const uid of userIds) {
      if (uid === caller.id) continue
      await admin.from('user_credentials').delete().eq('user_id', uid)
      await admin.from('user_roles').delete().eq('user_id', uid)
      await admin.from('profiles').delete().eq('user_id', uid)
      await admin.auth.admin.deleteUser(uid)
    }
    await admin.from('user_credentials').delete().eq('site_id', siteId)

    // 7. The site itself
    const { error: siteError } = await admin.from('sites').delete().eq('id', siteId)
    if (siteError) return json({ error: siteError.message }, 400)

    return json({
      success: true,
      deleted: {
        users: userIds.length,
        pharmacies: pharmacyIds.length,
        parcours: parcoursIds.length,
        axes: axisIds.length,
      },
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
