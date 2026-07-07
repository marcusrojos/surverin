import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Barcode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  Loader2,
  Trash2,
  Plus,
  ArrowLeft,
  ClipboardCheck,
  MapPin,
  ScanLine,
  SkipForward,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchAndCacheParcoursDeliveries } from '@/services/parcoursDeliveriesCache';

interface ExpectedColis {
  id: string;
  barcode: string;
  type: string;
  pharmacy_name: string;
  parcours_pharmacy_id: string;
}

interface ScannedItem {
  id: string;
  barcode: string;
  timestamp: Date;
}

interface InventoryFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcoursId: string;
  parcoursName: string;
  driverId: string;
  onCompleted: () => void;
}

type Phase = 'scanning' | 'review';

export function InventoryFlow({
  open,
  onOpenChange,
  parcoursId,
  parcoursName,
  driverId,
  onCompleted,
}: InventoryFlowProps) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [expectedColis, setExpectedColis] = useState<ExpectedColis[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  let scanCounter = useRef(0);

  useEffect(() => {
    if (open) {
      setPhase('scanning');
      setScannedItems([]);
      setBarcodeInput('');
      fetchExpectedColis();
    }
  }, [open, parcoursId]);

  const fetchExpectedColis = async () => {
    setLoading(true);
    try {
      // Get parcours_pharmacies with pharmacy names
      const { data: ppData, error: ppError } = await supabase
        .from('parcours_pharmacies')
        .select('id, pharmacy_id, pharmacy:pharmacies(name)')
        .eq('parcours_id', parcoursId);

      if (ppError) throw ppError;

      const pharmMap = new Map(
        (ppData || []).map((pp: any) => [
          pp.id,
          Array.isArray(pp.pharmacy) ? pp.pharmacy[0]?.name : pp.pharmacy?.name || 'Inconnu',
        ])
      );

      // Get all colis
      const { data: colisData, error: colisError } = await supabase
        .from('parcours_colis')
        .select('id, barcode, type, parcours_pharmacy_id')
        .eq('parcours_id', parcoursId);

      if (colisError) throw colisError;

      const mapped: ExpectedColis[] = (colisData || []).map((c: any) => ({
        id: c.id,
        barcode: c.barcode,
        type: c.type,
        pharmacy_name: pharmMap.get(c.parcours_pharmacy_id) || 'Inconnu',
        parcours_pharmacy_id: c.parcours_pharmacy_id,
      }));

      setExpectedColis(mapped);
    } catch {
      toast.error('Erreur lors du chargement des colis attendus');
    } finally {
      setLoading(false);
    }
  };

  // Comparison logic
  const comparison = useMemo(() => {
    const expectedBarcodes = new Map(expectedColis.map(c => [c.barcode.toLowerCase(), c]));
    const scannedBarcodes = new Set(scannedItems.map(s => s.barcode.toLowerCase()));

    const matched: (ExpectedColis & { scannedAt: Date })[] = [];
    const missing: ExpectedColis[] = [];
    const extra: ScannedItem[] = [];

    // Find matched and missing
    for (const expected of expectedColis) {
      if (scannedBarcodes.has(expected.barcode.toLowerCase())) {
        const scan = scannedItems.find(s => s.barcode.toLowerCase() === expected.barcode.toLowerCase())!;
        matched.push({ ...expected, scannedAt: scan.timestamp });
      } else {
        missing.push(expected);
      }
    }

    // Find extra (scanned but not expected)
    for (const scanned of scannedItems) {
      if (!expectedBarcodes.has(scanned.barcode.toLowerCase())) {
        extra.push(scanned);
      }
    }

    return { matched, missing, extra };
  }, [expectedColis, scannedItems]);

  const handleScan = () => {
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    // Check if already scanned
    if (scannedItems.some(s => s.barcode.toLowerCase() === barcode.toLowerCase())) {
      toast.error('Ce code-barres a déjà été scanné');
      setBarcodeInput('');
      inputRef.current?.focus();
      return;
    }

    setScannedItems(prev => [
      ...prev,
      { id: `scan-${++scanCounter.current}`, barcode, timestamp: new Date() },
    ]);

    // Check if it's expected
    const isExpected = expectedColis.some(c => c.barcode.toLowerCase() === barcode.toLowerCase());
    if (isExpected) {
      toast.success('Colis trouvé ✓');
    } else {
      toast.warning('Colis non attendu !');
    }

    setBarcodeInput('');
    inputRef.current?.focus();
  };

  const removeScan = (scanId: string) => {
    setScannedItems(prev => prev.filter(s => s.id !== scanId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan();
    }
  };

  const handleValidate = async () => {
    setSaving(true);
    try {
      // Create inventaire record
      const { data: inv, error: invError } = await supabase
        .from('parcours_inventaire')
        .insert({
          parcours_id: parcoursId,
          driver_id: driverId,
          status: 'valide',
          total_expected: expectedColis.length,
          total_scanned: scannedItems.length,
          total_missing: comparison.missing.length,
          total_extra: comparison.extra.length,
          completed_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (invError) throw invError;

      // Insert scan records
      const scanRows: any[] = [];

      for (const m of comparison.matched) {
        scanRows.push({
          inventaire_id: inv.id,
          barcode: m.barcode,
          type: m.type,
          status: 'matched',
          pharmacy_name: m.pharmacy_name,
        });
      }
      for (const m of comparison.missing) {
        scanRows.push({
          inventaire_id: inv.id,
          barcode: m.barcode,
          type: m.type,
          status: 'missing',
          pharmacy_name: m.pharmacy_name,
        });
      }
      for (const e of comparison.extra) {
        scanRows.push({
          inventaire_id: inv.id,
          barcode: e.barcode,
          type: null,
          status: 'extra',
          pharmacy_name: null,
        });
      }

      if (scanRows.length > 0) {
        const { error: scanError } = await supabase
          .from('parcours_inventaire_scans')
          .insert(scanRows);
        if (scanError) throw scanError;
      }

      // Update parcours status
      await supabase
        .from('parcours')
        .update({ status: 'en_cours' } as any)
        .eq('id', parcoursId);

      await fetchAndCacheParcoursDeliveries(parcoursId);

      toast.success('Inventaire validé — livraisons chargées en local');
      onOpenChange(false);
      onCompleted();
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleIgnore = async () => {
    setSaving(true);
    try {
      const { data: inv, error: invError } = await supabase
        .from('parcours_inventaire')
        .insert({
          parcours_id: parcoursId,
          driver_id: driverId,
          status: 'ignore',
          total_expected: expectedColis.length,
          total_scanned: scannedItems.length,
          total_missing: comparison.missing.length,
          total_extra: comparison.extra.length,
          notes: 'Inventaire ignoré par le chauffeur',
          completed_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (invError) throw invError;

      await supabase
        .from('parcours')
        .update({ status: 'en_cours' } as any)
        .eq('id', parcoursId);

      await fetchAndCacheParcoursDeliveries(parcoursId);

      toast.info('Inventaire ignoré — livraisons chargées en local');
      onOpenChange(false);
      onCompleted();
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const progress = expectedColis.length > 0
    ? Math.round((comparison.matched.length / expectedColis.length) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Inventaire — {parcoursName}
          </DialogTitle>
          <DialogDescription>
            Scannez les codes-barres des colis pour vérifier le chargement
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="px-5 pb-5">
            {/* ===== SCANNING PHASE ===== */}
            {phase === 'scanning' && (
              <div className="space-y-4 animate-fade-in">
                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {comparison.matched.length}/{expectedColis.length} colis scannés
                    </span>
                    <span className="font-semibold text-foreground">{progress}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        progress === 100 ? 'bg-green-500' : 'bg-primary'
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Scan input */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      placeholder="Scanner ou saisir le code-barres..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="pl-10 h-12 text-base"
                      autoFocus
                      maxLength={100}
                    />
                  </div>
                  <Button onClick={handleScan} disabled={!barcodeInput.trim()} className="h-12 px-4">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2">
                  <Card className={cn('border', comparison.matched.length > 0 && 'border-green-500/30 bg-green-500/5')}>
                    <CardContent className="py-2 px-3 text-center">
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{comparison.matched.length}</p>
                      <p className="text-[10px] text-muted-foreground">Trouvés</p>
                    </CardContent>
                  </Card>
                  <Card className={cn('border', comparison.extra.length > 0 && 'border-warning/30 bg-warning/5')}>
                    <CardContent className="py-2 px-3 text-center">
                      <p className="text-lg font-bold text-warning">{comparison.extra.length}</p>
                      <p className="text-[10px] text-muted-foreground">En trop</p>
                    </CardContent>
                  </Card>
                  <Card className={cn('border', comparison.missing.length > 0 && 'border-destructive/30 bg-destructive/5')}>
                    <CardContent className="py-2 px-3 text-center">
                      <p className="text-lg font-bold text-destructive">{comparison.missing.length}</p>
                      <p className="text-[10px] text-muted-foreground">Manquants</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Scanned list */}
                {scannedItems.length > 0 && (
                  <div className="space-y-1.5 max-h-[25vh] overflow-y-auto">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Colis scannés ({scannedItems.length})
                    </p>
                    {[...scannedItems].reverse().map((scan) => {
                      const expected = expectedColis.find(c => c.barcode.toLowerCase() === scan.barcode.toLowerCase());
                      const isExpected = !!expected;
                      return (
                        <div
                          key={scan.id}
                          className={cn(
                            'flex items-center gap-2 py-2 px-3 rounded-lg text-sm',
                            isExpected ? 'bg-green-500/5 border border-green-500/20' : 'bg-warning/5 border border-warning/20'
                          )}
                        >
                          {isExpected ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-xs truncate">{scan.barcode}</p>
                            {isExpected && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {expected!.type} · {expected!.pharmacy_name}
                              </p>
                            )}
                            {!isExpected && (
                              <p className="text-[10px] text-warning">Non assigné</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeScan(scan.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Annuler
                  </Button>
                  <Button onClick={() => setPhase('review')}>
                    Vérifier
                    <ClipboardCheck className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ===== REVIEW PHASE ===== */}
            {phase === 'review' && (
              <div className="space-y-4 animate-fade-in">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-2">
                  <Card className="border-2">
                    <CardContent className="py-3 text-center">
                      <p className="text-xs text-muted-foreground">Attendus</p>
                      <p className="text-2xl font-bold">{expectedColis.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-2">
                    <CardContent className="py-3 text-center">
                      <p className="text-xs text-muted-foreground">Scannés</p>
                      <p className="text-2xl font-bold">{scannedItems.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Result status */}
                {comparison.missing.length === 0 && comparison.extra.length === 0 ? (
                  <Card className="border-2 border-green-500 bg-green-500/5">
                    <CardContent className="py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600 dark:text-green-400" />
                      <p className="font-semibold text-green-700 dark:text-green-300">Inventaire complet</p>
                      <p className="text-xs text-muted-foreground mt-1">Tous les colis ont été trouvés</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-2 border-warning bg-warning/5">
                    <CardContent className="py-4 text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning" />
                      <p className="font-semibold text-warning">Écarts détectés</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {comparison.missing.length} manquant{comparison.missing.length > 1 ? 's' : ''}
                        {comparison.extra.length > 0 && ` · ${comparison.extra.length} en trop`}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Matched colis */}
                {comparison.matched.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Trouvés ({comparison.matched.length})
                    </p>
                    <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                      {comparison.matched.map(c => (
                        <div key={c.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-green-500/5 border border-green-500/15 text-sm">
                          <Barcode className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                          <span className="font-mono text-xs flex-1 truncate">{c.barcode}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{c.type}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />{c.pharmacy_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing colis */}
                {comparison.missing.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Manquants ({comparison.missing.length})
                    </p>
                    <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                      {comparison.missing.map(c => (
                        <div key={c.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-destructive/5 border border-destructive/15 text-sm">
                          <Barcode className="w-3.5 h-3.5 text-destructive shrink-0" />
                          <span className="font-mono text-xs flex-1 truncate">{c.barcode}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{c.type}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />{c.pharmacy_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extra colis */}
                {comparison.extra.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-warning uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      En trop ({comparison.extra.length})
                    </p>
                    <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                      {comparison.extra.map(e => (
                        <div key={e.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-warning/5 border border-warning/15 text-sm">
                          <Barcode className="w-3.5 h-3.5 text-warning shrink-0" />
                          <span className="font-mono text-xs flex-1 truncate">{e.barcode}</span>
                          <span className="text-[10px] text-warning shrink-0">Non assigné</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPhase('scanning')}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Corriger
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-warning border-warning/30 hover:bg-warning/10"
                      onClick={handleIgnore}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <SkipForward className="w-4 h-4 mr-1" />}
                      Ignorer
                    </Button>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleValidate}
                    disabled={saving}
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enregistrement...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" /> Valider l'inventaire</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
