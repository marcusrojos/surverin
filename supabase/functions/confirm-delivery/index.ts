import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return json({ error: 'Non autorisé' }, 401)

    const body = await req.json()
    const {
      deliveryId,
      verificationCode,
      recipientName,
      recipientSignature,
      nbCartonsReceived,
      nbSachetsReceived,
      nbBarquesReceived,
      bacsToRecover,
      bacsRecovered,
      nbBarquesDelivered,
      driverLatitude,
      driverLongitude,
    } = body ?? {}

    if (!deliveryId) return json({ error: 'deliveryId requis' }, 400)
    if (!recipientName || typeof recipientName !== 'string' || !recipientName.trim()) {
      return json({ error: 'Le nom du destinataire est requis' }, 400)
    }
    if (!recipientSignature) return json({ error: 'La signature est requise' }, 400)

    // Load the delivery with the service role (bypasses RLS but we authorize manually)
    const { data: delivery, error: delErr } = await supabaseAdmin
      .from('deliveries')
      .select('id, driver_id, pharmacy_id, parcours_id, status, verification_code')
      .eq('id', deliveryId)
      .maybeSingle()

    if (delErr || !delivery) return json({ error: 'Livraison introuvable' }, 404)

    // Authorization: only the assigned driver may confirm
    if (delivery.driver_id !== caller.id) return json({ error: 'Accès refusé' }, 403)

    // Server-side verification code check
    if (delivery.verification_code) {
      if (!verificationCode || String(verificationCode) !== String(delivery.verification_code)) {
        return json({ error: 'Code de vérification incorrect' }, 403)
      }
    }

    const toRecover = Number(bacsToRecover) || 0
    const recovered = Number(bacsRecovered) || 0
    const delivered = Number(nbBarquesDelivered) || 0

    const { error: updErr } = await supabaseAdmin
      .from('deliveries')
      .update({
        status: 'livre',
        recipient_name: recipientName.trim(),
        recipient_signature: recipientSignature,
        nb_cartons_received: Number(nbCartonsReceived) || 0,
        nb_sachets_received: Number(nbSachetsReceived) || 0,
        nb_barques_received: Number(nbBarquesReceived) || 0,
        bacs_to_recover: toRecover,
        bacs_recovered: recovered,
        delivered_at: new Date().toISOString(),
        driver_latitude: driverLatitude ?? null,
        driver_longitude: driverLongitude ?? null,
      })
      .eq('id', deliveryId)

    if (updErr) return json({ error: updErr.message }, 400)

    // Update rolling bacs balance: (previous pending - recovered) + delivered now
    const newPending = Math.max(0, toRecover - recovered) + delivered
    const { data: existingBalance } = await supabaseAdmin
      .from('pharmacy_bacs_balance')
      .select('id')
      .eq('pharmacy_id', delivery.pharmacy_id)
      .maybeSingle()

    if (existingBalance) {
      await supabaseAdmin
        .from('pharmacy_bacs_balance')
        .update({ pending_bacs: newPending, updated_at: new Date().toISOString() })
        .eq('pharmacy_id', delivery.pharmacy_id)
    } else {
      await supabaseAdmin
        .from('pharmacy_bacs_balance')
        .insert({ pharmacy_id: delivery.pharmacy_id, pending_bacs: newPending })
    }

    // Mark parcours as finished if all its deliveries are delivered
    let parcoursDone = false
    if (delivery.parcours_id) {
      const { data: remaining } = await supabaseAdmin
        .from('deliveries')
        .select('id')
        .eq('parcours_id', delivery.parcours_id)
        .neq('status', 'livre')
        .limit(1)
      if (!remaining || remaining.length === 0) {
        await supabaseAdmin.from('parcours').update({ status: 'termine' }).eq('id', delivery.parcours_id)
        parcoursDone = true
      }
    }

    return json({ success: true, parcoursDone })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
