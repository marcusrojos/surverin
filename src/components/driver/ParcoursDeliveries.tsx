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

interface Delivery {
  id: string;
  reference: string;
  status: string;
  pharmacy_id: string;
  pharmacy_name: string;
  pharmacy_address: string | null;
  nb_cartons: number;
  nb_sachets: number;
  nb_barques: number;
  verification_code: string | null;
  delivered_at: string | null;
  recipient_name: string | null;
  created_at: string;
}

export function ParcoursDeliveries({
  parcoursId,
  parcoursName,
  driverId,
  forceConfirmed,
  onBack,
}: ParcoursDeliveriesProps) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOnline, queueDelivery, pendingDeliveries, syncPending } = useOfflineSync();

  // Validation dialog
  const [validatingDelivery, setValidatingDelivery] = useState<Delivery | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [signature, setSignature] = useState<string | null>('');
  const [nbCartonsReceived, setNbCartonsReceived] = useState(0);
  const [nbSachetsReceived, setNbSachetsReceived] = useState(0);
  const [nbBarquesReceived, setNbBarquesReceived] = useState(0);
  const [offlinePhoto, setOfflinePhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ppData, error: ppError } = await supabase
        .from('parcours_pharmacies')
        .select('pharmacy_id')
        .eq('parcours_id', parcoursId);

      if (ppError) throw ppError;

      const pharmacyIds = (ppData || []).map(pp => pp.pharmacy_id);
      if (pharmacyIds.length === 0) {
        setDeliveries([]);
        setLoading(false);
        return;
      }

      const { data: delData, error: delError } = await supabase
        .from('deliveries')
        .select('*')
        .eq('driver_id', driverId)
        .in('pharmacy_id', pharmacyIds)
        .order('created_at', { ascending: true });

      if (delError) throw delError;

      const { data: pharmData } = await supabase
        .from('pharmacies')
        .select('id, name, address')
        .in('id', pharmacyIds);

      const pharmMap = new Map((pharmData || []).map(p => [p.id, p]));

      const mapped: Delivery[] = (delData || []).map(d => ({
        id: d.id,
        reference: d.reference,
        status: d.status,
        pharmacy_id: d.pharmacy_id,
        pharmacy_name: pharmMap.get(d.pharmacy_id)?.name || 'Inconnu',
        pharmacy_address: pharmMap.get(d.pharmacy_id)?.address || null,
        nb_cartons: d.nb_cartons,
        nb_sachets: d.nb_sachets,
        nb_barques: d.nb_barques,
        verification_code: d.verification_code,
        delivered_at: d.delivered_at,
        recipient_name: d.recipient_name,
        created_at: d.created_at,
      }));

      setDeliveries(mapped);
    } catch {
      toast.error('Erreur lors du chargement des livraisons');
    } finally {
      setLoading(false);
    }
  }, [parcoursId, driverId]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const openValidation = (delivery: Delivery) => {
    setValidatingDelivery(delivery);
    setRecipientName('');
    setVerificationCode('');
    setSignature('');
    setOfflinePhoto(null);
    setNbCartonsReceived(delivery.nb_cartons);
    setNbSachetsReceived(delivery.nb_sachets);
    setNbBarquesReceived(delivery.nb_barques);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOfflinePhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleValidateDelivery = async () => {
    if (!validatingDelivery) return;
    if (!recipientName.trim()) {
      toast.error('Le nom du destinataire est requis');
      return;
    }

    // Online mode
    if (isOnline) {
      if (validatingDelivery.verification_code && verificationCode !== validatingDelivery.verification_code) {
        toast.error('Code de vérification incorrect');
        return;
      }

      setSaving(true);
      try {
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
          .eq('id', validatingDelivery.id);

        if (error) throw error;

        toast.success('Livraison validée ✓');
        setValidatingDelivery(null);
        fetchDeliveries();

        // Check if all deliveries are done
        const updatedDeliveries = deliveries.map(d =>
          d.id === validatingDelivery.id ? { ...d, status: 'livre' } : d
        );
        const allDone = updatedDeliveries.every(d => d.status === 'livre');
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
      // Offline mode - queue delivery
      queueDelivery({
        deliveryId: validatingDelivery.id,
        reference: validatingDelivery.reference,
        recipientName: recipientName.trim(),
        recipientSignature: signature || null,
        deliveredAt: new Date().toISOString(),
        nb_cartons_received: nbCartonsReceived,
        nb_sachets_received: nbSachetsReceived,
        nb_barques_received: nbBarquesReceived,
      });

      toast.success('Livraison sauvegardée hors-ligne — sera synchronisée automatiquement');
      setValidatingDelivery(null);

      // Optimistically update local state
      setDeliveries(prev => prev.map(d =>
        d.id === validatingDelivery.id ? { ...d, status: 'livre', recipient_name: recipientName.trim(), delivered_at: new Date().toISOString() } : d
      ));
    }
  };

  const pending = deliveries.filter(d => d.status === 'en_attente' && !pendingDeliveries.some(pd => pd.deliveryId === d.id));
  const delivered = deliveries.filter(d => d.status === 'livre' || pendingDeliveries.some(pd => pd.deliveryId === d.id));

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
            {deliveries.length} livraison{deliveries.length > 1 ? 's' : ''} · {delivered.length} effectuée{delivered.length > 1 ? 's' : ''}
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
      {deliveries.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{delivered.length}/{deliveries.length} livrées</span>
            <span>{Math.round((delivered.length / deliveries.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', delivered.length === deliveries.length ? 'bg-green-500' : 'bg-primary')}
              style={{ width: `${(delivered.length / deliveries.length) * 100}%` }}
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
      ) : deliveries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune livraison pour ce parcours</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending deliveries */}
          {pending.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                À livrer ({pending.length})
              </p>
              {pending.map(delivery => (
                <Card key={delivery.id} className="card-hover border-primary/20">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{delivery.pharmacy_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{delivery.reference}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30 shrink-0">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        </div>

                        {/* Destination address */}
                        {delivery.pharmacy_address && (
                          <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-muted/50">
                            <Navigation className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-foreground leading-relaxed">{delivery.pharmacy_address}</p>
                          </div>
                        )}

                        {/* Package counts */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {delivery.nb_cartons > 0 && <span className="flex items-center gap-1"><Package className="w-3 h-3" />{delivery.nb_cartons} carton{delivery.nb_cartons > 1 ? 's' : ''}</span>}
                          {delivery.nb_sachets > 0 && <span>{delivery.nb_sachets} sachet{delivery.nb_sachets > 1 ? 's' : ''}</span>}
                          {delivery.nb_barques > 0 && <span>{delivery.nb_barques} barque{delivery.nb_barques > 1 ? 's' : ''}</span>}
                        </div>

                        <Button
                          size="sm"
                          className="mt-3 w-full"
                          onClick={() => openValidation(delivery)}
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
              {delivered.map(delivery => {
                const isPendingSync = pendingDeliveries.some(pd => pd.deliveryId === delivery.id);
                return (
                  <Card key={delivery.id} className={cn('opacity-70', isPendingSync && 'border-warning/30')}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isPendingSync ? 'bg-warning/10' : 'bg-green-500/10')}>
                          {isPendingSync ? <WifiOff className="w-5 h-5 text-warning" /> : <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{delivery.pharmacy_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{delivery.reference}</p>
                          {delivery.pharmacy_address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {delivery.pharmacy_address}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {delivery.recipient_name && <span>Reçu par : {delivery.recipient_name}</span>}
                            {delivery.delivered_at && (
                              <span>· {format(new Date(delivery.delivered_at), 'dd MMM HH:mm', { locale: fr })}</span>
                            )}
                            {isPendingSync && <span className="text-warning">· En attente sync</span>}
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
      <Dialog open={!!validatingDelivery} onOpenChange={(open) => { if (!open) setValidatingDelivery(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Livrer
            </DialogTitle>
            <DialogDescription>
              {validatingDelivery?.pharmacy_name}
              {validatingDelivery?.pharmacy_address && (
                <span className="block text-xs mt-0.5">{validatingDelivery.pharmacy_address}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Offline indicator */}
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
            {isOnline && validatingDelivery?.verification_code && (
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
                {(validatingDelivery?.nb_cartons ?? 0) > 0 && (
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
                {(validatingDelivery?.nb_sachets ?? 0) > 0 && (
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
                {(validatingDelivery?.nb_barques ?? 0) > 0 && (
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
