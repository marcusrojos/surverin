import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
  Truck,
  ShieldCheck,
  PenLine,
  Hash,
  Navigation,
  WifiOff,
  Camera,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SignaturePad } from '@/components/ui/signature-pad';
import { useOfflineSync } from '@/hooks/use-offline-sync';

interface ParcoursDeliveriesProps {
  parcoursId: string;
  parcoursName: string;
  driverId: string;
  forceConfirmed: boolean;
  onBack: () => void;
}

interface PharmacyDelivery {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyAddress: string | null;
  position: number;
  colis: { id: string; barcode: string; type: string }[];
  // Existing delivery record (if any)
  deliveryId: string | null;
  deliveryStatus: string | null;
  deliveryReference: string | null;
  deliveredAt: string | null;
  recipientName: string | null;
  verificationCode: string | null;
  nb_cartons: number;
  nb_sachets: number;
  nb_barques: number;
}

export function ParcoursDeliveries({
  parcoursId,
  parcoursName,
  driverId,
  forceConfirmed,
  onBack,
}: ParcoursDeliveriesProps) {
  const [pharmacyDeliveries, setPharmacyDeliveries] = useState<PharmacyDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOnline, queueDelivery, pendingDeliveries, syncPending } = useOfflineSync();

  // Validation dialog
  const [validating, setValidating] = useState<PharmacyDelivery | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [signature, setSignature] = useState<string | null>('');
  const [nbCartonsReceived, setNbCartonsReceived] = useState(0);
  const [nbSachetsReceived, setNbSachetsReceived] = useState(0);
  const [nbBarquesReceived, setNbBarquesReceived] = useState(0);
  const [offlinePhoto, setOfflinePhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch parcours_pharmacies with position
      const { data: ppData, error: ppError } = await supabase
        .from('parcours_pharmacies')
        .select('id, pharmacy_id, position')
        .eq('parcours_id', parcoursId)
        .order('position', { ascending: true });

      if (ppError) throw ppError;
      if (!ppData || ppData.length === 0) {
        setPharmacyDeliveries([]);
        setLoading(false);
        return;
      }

      const pharmacyIds = ppData.map(pp => pp.pharmacy_id);
      const ppIds = ppData.map(pp => pp.id);

      // 2. Fetch pharmacy details, colis, and existing deliveries in parallel
      const [pharmRes, colisRes, delivRes] = await Promise.all([
        supabase.from('pharmacies').select('id, name, address').in('id', pharmacyIds),
        supabase.from('parcours_colis').select('id, barcode, type, parcours_pharmacy_id').in('parcours_pharmacy_id', ppIds),
        supabase.from('deliveries').select('*').eq('driver_id', driverId).in('pharmacy_id', pharmacyIds),
      ]);

      const pharmMap = new Map((pharmRes.data || []).map(p => [p.id, p]));

      // Group colis by parcours_pharmacy_id
      const colisMap = new Map<string, { id: string; barcode: string; type: string }[]>();
      (colisRes.data || []).forEach(c => {
        const list = colisMap.get(c.parcours_pharmacy_id) || [];
        list.push({ id: c.id, barcode: c.barcode, type: c.type });
        colisMap.set(c.parcours_pharmacy_id, list);
      });

      // Map deliveries by pharmacy_id
      const delivMap = new Map<string, typeof delivRes.data extends (infer T)[] ? T : never>();
      (delivRes.data || []).forEach(d => {
        delivMap.set(d.pharmacy_id, d);
      });

      const mapped: PharmacyDelivery[] = ppData.map(pp => {
        const pharm = pharmMap.get(pp.pharmacy_id);
        const colis = colisMap.get(pp.id) || [];
        const deliv = delivMap.get(pp.pharmacy_id);

        // Count colis by type
        const nbCartons = colis.filter(c => c.type === 'carton').length;
        const nbSachets = colis.filter(c => c.type === 'sachet').length;
        const nbBarques = colis.filter(c => c.type === 'barque').length;

        return {
          pharmacyId: pp.pharmacy_id,
          pharmacyName: pharm?.name || 'Inconnu',
          pharmacyAddress: pharm?.address || null,
          position: pp.position,
          colis,
          deliveryId: deliv?.id || null,
          deliveryStatus: deliv?.status || null,
          deliveryReference: deliv?.reference || null,
          deliveredAt: deliv?.delivered_at || null,
          recipientName: deliv?.recipient_name || null,
          verificationCode: deliv?.verification_code || null,
          nb_cartons: nbCartons,
          nb_sachets: nbSachets,
          nb_barques: nbBarques,
        };
      });

      setPharmacyDeliveries(mapped);
    } catch {
      toast.error('Erreur lors du chargement des livraisons');
    } finally {
      setLoading(false);
    }
  }, [parcoursId, driverId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openValidation = (pd: PharmacyDelivery) => {
    setValidating(pd);
    setRecipientName('');
    setVerificationCode('');
    setSignature('');
    setOfflinePhoto(null);
    setNbCartonsReceived(pd.nb_cartons);
    setNbSachetsReceived(pd.nb_sachets);
    setNbBarquesReceived(pd.nb_barques);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOfflinePhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleValidateDelivery = async () => {
    if (!validating) return;
    if (!recipientName.trim()) {
      toast.error('Le nom du destinataire est requis');
      return;
    }

    if (isOnline) {
      if (validating.verificationCode && verificationCode !== validating.verificationCode) {
        toast.error('Code de vérification incorrect');
        return;
      }

      setSaving(true);
      try {
        let deliveryId = validating.deliveryId;

        if (!deliveryId) {
          // Create delivery record from parcours_colis data
          const reference = `${parcoursName}-${validating.pharmacyName}-${Date.now()}`.substring(0, 50);
          const { data: newDelivery, error: insertError } = await supabase
            .from('deliveries')
            .insert({
              pharmacy_id: validating.pharmacyId,
              driver_id: driverId,
              reference,
              nb_cartons: validating.nb_cartons,
              nb_sachets: validating.nb_sachets,
              nb_barques: validating.nb_barques,
              packages: validating.colis.map(c => ({ barcode: c.barcode, type: c.type })),
              status: 'en_attente' as const,
              verification_code: null,
            })
            .select('id')
            .single();
          if (insertError) throw insertError;
          deliveryId = newDelivery.id;
        }

        const { error } = await supabase
          .from('deliveries')
          .update({
            status: 'livre',
            recipient_name: recipientName.trim(),
            recipient_signature: signature || null,
            nb_cartons_received: nbCartonsReceived,
            nb_sachets_received: nbSachetsReceived,
            nb_barques_received: nbBarquesReceived,
            delivered_at: new Date().toISOString(),
          } as any)
          .eq('id', deliveryId);
        if (error) throw error;

        toast.success('Livraison validée ✓');
        setValidating(null);
        fetchData();

        // Check if all deliveries are done
        const updatedList = pharmacyDeliveries.map(pd =>
          pd.pharmacyId === validating.pharmacyId ? { ...pd, deliveryStatus: 'livre' } : pd
        );
        const allDone = updatedList.every(pd => pd.deliveryStatus === 'livre');
        if (allDone) {
          await supabase
            .from('parcours')
            .update({ status: 'termine' } as any)
            .eq('id', parcoursId);
          toast.success('🎉 Toutes les livraisons terminées ! Parcours terminé.');
        }
      } catch {
        toast.error('Erreur lors de la validation');
      } finally {
        setSaving(false);
      }
    } else {
      // Offline mode: queue delivery
      const reference = validating.deliveryReference || `${parcoursName}-${validating.pharmacyName}`;
      if (validating.deliveryId) {
        queueDelivery({
          deliveryId: validating.deliveryId,
          reference,
          recipientName: recipientName.trim(),
          recipientSignature: signature || null,
          deliveredAt: new Date().toISOString(),
          nb_cartons_received: nbCartonsReceived,
          nb_sachets_received: nbSachetsReceived,
          nb_barques_received: nbBarquesReceived,
        });
      } else {
        toast.error('Livraison hors-ligne impossible sans connexion préalable');
        return;
      }
      toast.success('Livraison sauvegardée hors-ligne');
      setValidating(null);
      setPharmacyDeliveries(prev => prev.map(pd =>
        pd.pharmacyId === validating.pharmacyId
          ? { ...pd, deliveryStatus: 'livre', recipientName: recipientName.trim(), deliveredAt: new Date().toISOString() }
          : pd
      ));
    }
  };

  const pending = pharmacyDeliveries.filter(pd =>
    pd.deliveryStatus !== 'livre' && !pendingDeliveries.some(p => p.deliveryId === pd.deliveryId)
  );
  const delivered = pharmacyDeliveries.filter(pd =>
    pd.deliveryStatus === 'livre' || pendingDeliveries.some(p => p.deliveryId === pd.deliveryId)
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{parcoursName}</h2>
          <p className="text-xs text-muted-foreground">
            {pharmacyDeliveries.length} pharmacie{pharmacyDeliveries.length > 1 ? 's' : ''} · {delivered.length} livrée{delivered.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <WifiOff className="w-3 h-3" /> Hors-ligne
            </span>
          )}
          {forceConfirmed && (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <ShieldCheck className="w-3 h-3" /> Forcé
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {pharmacyDeliveries.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{delivered.length}/{pharmacyDeliveries.length} livrées</span>
            <span>{Math.round((delivered.length / pharmacyDeliveries.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', delivered.length === pharmacyDeliveries.length ? 'bg-green-500' : 'bg-primary')}
              style={{ width: `${(delivered.length / pharmacyDeliveries.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Pending offline sync indicator */}
      {pendingDeliveries.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-warning">
              {pendingDeliveries.length} livraison{pendingDeliveries.length > 1 ? 's' : ''} en attente de synchronisation
            </p>
            {isOnline && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={syncPending}>
                Synchroniser
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : pharmacyDeliveries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune pharmacie dans ce parcours</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending deliveries */}
          {pending.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                À livrer ({pending.length})
              </p>
              {pending.map(pd => (
                <Card key={pd.pharmacyId} className="card-hover border-primary/20">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{pd.pharmacyName}</p>
                            {pd.deliveryReference && (
                              <p className="text-xs text-muted-foreground mt-0.5">{pd.deliveryReference}</p>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30 shrink-0">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        </div>

                        {/* Destination address */}
                        {pd.pharmacyAddress && (
                          <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-muted/50">
                            <Navigation className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-foreground leading-relaxed">{pd.pharmacyAddress}</p>
                          </div>
                        )}

                        {/* Colis list */}
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                            Colis ({pd.colis.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {pd.nb_cartons > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Package className="w-3 h-3" />{pd.nb_cartons} carton{pd.nb_cartons > 1 ? 's' : ''}
                              </span>
                            )}
                            {pd.nb_sachets > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {pd.nb_sachets} sachet{pd.nb_sachets > 1 ? 's' : ''}
                              </span>
                            )}
                            {pd.nb_barques > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {pd.nb_barques} barque{pd.nb_barques > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {pd.colis.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pd.colis.map(c => (
                                <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                                  {c.barcode}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <Button
                          size="sm"
                          className="mt-3 w-full"
                          onClick={() => openValidation(pd)}
                        >
                          <Truck className="w-4 h-4 mr-1.5" />
                          Livrer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {/* Delivered */}
          {delivered.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
                Livrées ({delivered.length})
              </p>
              {delivered.map(pd => {
                const isPendingSync = pendingDeliveries.some(p => p.deliveryId === pd.deliveryId);
                return (
                  <Card key={pd.pharmacyId} className={cn('opacity-70', isPendingSync && 'border-warning/30')}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isPendingSync ? 'bg-warning/10' : 'bg-green-500/10')}>
                          {isPendingSync ? <WifiOff className="w-5 h-5 text-warning" /> : <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{pd.pharmacyName}</p>
                          {pd.deliveryReference && (
                            <p className="text-xs text-muted-foreground mt-0.5">{pd.deliveryReference}</p>
                          )}
                          {pd.pharmacyAddress && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {pd.pharmacyAddress}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {pd.recipientName && <span>Reçu par : {pd.recipientName}</span>}
                            {pd.deliveredAt && (
                              <span>· {format(new Date(pd.deliveredAt), 'dd MMM HH:mm', { locale: fr })}</span>
                            )}
                            {isPendingSync && <span className="text-warning">· En attente sync</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-muted-foreground">
                            <span>{pd.colis.length} colis</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Validation Dialog */}
      <Dialog open={!!validating} onOpenChange={(open) => { if (!open) setValidating(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Livrer
            </DialogTitle>
            <DialogDescription>
              {validating?.pharmacyName}
              {validating?.pharmacyAddress && (
                <span className="block text-xs mt-0.5">{validating.pharmacyAddress}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!isOnline && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="py-2 flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-warning shrink-0" />
                <p className="text-xs text-warning">
                  Mode hors-ligne — la livraison sera synchronisée automatiquement
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {/* Colis summary */}
            {validating && validating.colis.length > 0 && (
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Colis à livrer</p>
                <div className="flex flex-wrap gap-1">
                  {validating.colis.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background text-[10px] font-mono text-muted-foreground border">
                      {c.type}: {c.barcode}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recipient name */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" />
                Nom du destinataire *
              </Label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nom de la personne qui réceptionne"
              />
            </div>

            {/* Verification code - only in online mode */}
            {isOnline && validating?.verificationCode && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  Code de vérification *
                </Label>
                <Input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Code à 6 chiffres"
                  maxLength={6}
                />
                <p className="text-[10px] text-muted-foreground">Demandez le code au pharmacien</p>
              </div>
            )}

            {/* Quantities received */}
            <div className="space-y-2">
              <Label>Quantités reçues</Label>
              <div className="grid grid-cols-3 gap-2">
                {(validating?.nb_cartons ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Cartons</p>
                    <Input
                      type="number"
                      min={0}
                      value={nbCartonsReceived}
                      onChange={(e) => setNbCartonsReceived(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
                {(validating?.nb_sachets ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Sachets</p>
                    <Input
                      type="number"
                      min={0}
                      value={nbSachetsReceived}
                      onChange={(e) => setNbSachetsReceived(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
                {(validating?.nb_barques ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Barques</p>
                    <Input
                      type="number"
                      min={0}
                      value={nbBarquesReceived}
                      onChange={(e) => setNbBarquesReceived(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Signature */}
            <div className="space-y-1.5">
              <Label>Signature du destinataire</Label>
              <SignaturePad
                onSignatureChange={setSignature}
                className="border rounded-lg"
              />
            </div>

            {/* Photo - only in offline mode */}
            {!isOnline && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  Photo du bon de livraison (optionnelle)
                </Label>
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="text-xs"
                />
                {offlinePhoto && (
                  <div className="relative">
                    <img src={offlinePhoto} alt="Photo bon" className="w-full h-32 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => setOfflinePhoto(null)}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-1 text-xs text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleValidateDelivery}
              disabled={saving || !recipientName.trim()}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Validation...</>
              ) : (
                <><Truck className="w-4 h-4 mr-2" /> {isOnline ? 'Confirmer la livraison' : 'Sauvegarder hors-ligne'}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
