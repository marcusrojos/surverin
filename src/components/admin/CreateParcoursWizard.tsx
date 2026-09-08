import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArrowRight, ArrowLeft, Route, MapPin, User, Loader2, Building2, CheckCircle2, Plus, Trash2, Package, Barcode, AlertCircle, Search } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BarcodeScanButton } from '@/components/ui/barcode-scan-button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';


interface Axis {
  id: string;
  name: string;
  description: string | null;
}

interface Driver {
  user_id: string;
  full_name: string;
}

interface AxisPharmacy {
  id: string;
  pharmacy_id: string;
  position: number;
  pharmacy: {
    id: string;
    name: string;
    address: string | null;
  };
}

interface ColisItem {
  id: string;
  type: 'carton' | 'sachet' | 'bac';
  barcode: string;
}

// Map of pharmacy_id -> array of colis
type PharmacyPackages = Record<string, ColisItem[]>;

interface CreateParcoursWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

let colisCounter = 0;
const newColisId = () => `colis-${++colisCounter}-${Date.now()}`;

export function CreateParcoursWizard({ open, onOpenChange, onCreated }: CreateParcoursWizardProps) {
  const [step, setStep] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [parcoursName, setParcoursName] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');

  // Step 2
  const [axisPharmacies, setAxisPharmacies] = useState<AxisPharmacy[]>([]);
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<Set<string>>(new Set());

  // Step 3
  const [pharmacyPackages, setPharmacyPackages] = useState<PharmacyPackages>({});

  useEffect(() => {
    if (open) {
      setStep(0);
      setParcoursName('');
      setSelectedAxis('');
      setSelectedDriver('');
      setAxisPharmacies([]);
      setSelectedPharmacyIds(new Set());
      setPharmacyPackages({});
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [axesRes, rolesRes] = await Promise.all([
        supabase.from('axes').select('id, name, description').order('name'),
        supabase.from('user_roles').select('user_id').eq('role', 'livreur'),
      ]);

      setAxes(axesRes.data || []);

      const driverIds = rolesRes.data?.map(r => r.user_id) || [];
      if (driverIds.length > 0) {
        const { data: driversData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', driverIds)
          .eq('is_active', true);
        setDrivers(driversData || []);
      } else {
        setDrivers([]);
      }
    } catch {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const fetchAxisPharmacies = async (axisId: string) => {
    setLoadingPharmacies(true);
    try {
      const { data, error } = await supabase
        .from('axis_pharmacies')
        .select('id, pharmacy_id, position, pharmacy:pharmacies(id, name, address)')
        .eq('axis_id', axisId)
        .order('position');

      if (error) throw error;

      const mapped = (data || []).map(item => ({
        ...item,
        pharmacy: Array.isArray(item.pharmacy) ? item.pharmacy[0] : item.pharmacy,
      })) as AxisPharmacy[];

      setAxisPharmacies(mapped);
      setSelectedPharmacyIds(new Set(mapped.map(p => p.pharmacy_id)));
    } catch {
      toast.error('Erreur lors du chargement des pharmacies');
    } finally {
      setLoadingPharmacies(false);
    }
  };

  // Collect all barcodes across all pharmacies for uniqueness check
  const allBarcodes = useMemo(() => {
    const map = new Map<string, { pharmacyId: string; colisId: string }>();
    for (const [pharmId, items] of Object.entries(pharmacyPackages)) {
      for (const item of items) {
        if (item.barcode.trim()) {
          map.set(item.barcode.trim().toLowerCase(), { pharmacyId: pharmId, colisId: item.id });
        }
      }
    }
    return map;
  }, [pharmacyPackages]);

  const isDuplicateBarcode = (barcode: string, currentColisId: string): boolean => {
    const trimmed = barcode.trim().toLowerCase();
    if (!trimmed) return false;
    const existing = allBarcodes.get(trimmed);
    return !!existing && existing.colisId !== currentColisId;
  };

  const isStep1Valid = parcoursName.trim() !== '' && selectedAxis !== '' && selectedDriver !== '';
  const isStep2Valid = selectedPharmacyIds.size > 0;

  const isStep3Valid = useMemo(() => {
    const selectedIds = Array.from(selectedPharmacyIds);
    // Every selected pharmacy must have at least one colis with a valid non-empty barcode
    return selectedIds.every(id => {
      const items = pharmacyPackages[id];
      return items && items.length > 0 && items.every(c => c.barcode.trim() !== '');
    }) && !Array.from(allBarcodes.entries()).some(([bc, info]) => {
      // Check for duplicate barcodes
      const count = Object.values(pharmacyPackages).flat().filter(c => c.barcode.trim().toLowerCase() === bc).length;
      return count > 1;
    });
  }, [selectedPharmacyIds, pharmacyPackages, allBarcodes]);

  const handleGoToStep2 = () => {
    if (isStep1Valid) {
      setStep(1);
      fetchAxisPharmacies(selectedAxis);
    }
  };

  const handleGoToStep3 = () => {
    if (isStep2Valid) {
      // Initialize packages for newly selected pharmacies, keep existing ones
      setPharmacyPackages(prev => {
        const next = { ...prev };
        for (const id of selectedPharmacyIds) {
          if (!next[id]) {
            next[id] = [];
          }
        }
        // Remove deselected pharmacies
        for (const key of Object.keys(next)) {
          if (!selectedPharmacyIds.has(key)) {
            delete next[key];
          }
        }
        return next;
      });
      setStep(2);
    }
  };

  const handleValidate = async () => {
    if (!isStep3Valid) return;

    setIsSaving(true);
    try {
      // Derive the site from the selected axis (keeps data scoped to one site)
      const { data: axisData } = await supabase
        .from('axes')
        .select('site_id')
        .eq('id', selectedAxis)
        .single();
      const siteId = (axisData as any)?.site_id ?? null;

      // 1. Create the parcours
      const { data: parcours, error: parcoursError } = await supabase
        .from('parcours')
        .insert({
          name: parcoursName.trim(),
          axis_id: selectedAxis,
          driver_id: selectedDriver,
          status: 'en_attente_inventaire',
          site_id: siteId,
        } as any)
        .select('id')
        .single();

      if (parcoursError) throw parcoursError;
      const parcoursId = parcours.id;

      // 2. Insert parcours_pharmacies
      const pharmacyRows = selectedPharmaciesOrdered.map((ap, index) => ({
        parcours_id: parcoursId,
        pharmacy_id: ap.pharmacy_id,
        position: index,
      }));

      const { data: insertedPharmacies, error: pharmError } = await supabase
        .from('parcours_pharmacies')
        .insert(pharmacyRows as any)
        .select('id, pharmacy_id');

      if (pharmError) throw pharmError;

      // 3. Insert parcours_colis
      const pharmIdMap = new Map((insertedPharmacies || []).map((p: any) => [p.pharmacy_id, p.id]));

      const colisRows: any[] = [];
      for (const [pharmacyId, items] of Object.entries(pharmacyPackages)) {
        const parcoursPharmacyId = pharmIdMap.get(pharmacyId);
        if (!parcoursPharmacyId) continue;
        for (const colis of items) {
          colisRows.push({
            parcours_id: parcoursId,
            parcours_pharmacy_id: parcoursPharmacyId,
            type: colis.type,
            barcode: colis.barcode.trim(),
          });
        }
      }

      if (colisRows.length > 0) {
        const { error: colisError } = await supabase
          .from('parcours_colis')
          .insert(colisRows);

        if (colisError) throw colisError;
      }

      // 4. Check which pharmacies have active accounts (for verification codes)
      const pharmacyIdsSelected = selectedPharmaciesOrdered.map(ap => ap.pharmacy_id);
      const { data: pharmaciesWithAccounts } = await supabase
        .from('pharmacies')
        .select('id, user_id')
        .in('id', pharmacyIdsSelected)
        .not('user_id', 'is', null);

      // Check active profiles for those pharmacies
      const activePharmacyIds = new Set<string>();
      if (pharmaciesWithAccounts && pharmaciesWithAccounts.length > 0) {
        const userIds = pharmaciesWithAccounts.map(p => p.user_id!);
        const { data: activeProfiles } = await supabase
          .from('profiles')
          .select('user_id')
          .in('user_id', userIds)
          .eq('is_active', true);
        const activeUserIds = new Set((activeProfiles || []).map(p => p.user_id));
        pharmaciesWithAccounts.forEach(p => {
          if (activeUserIds.has(p.user_id!)) activePharmacyIds.add(p.id);
        });
      }

      // Generate a 6-digit verification code
      const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

      // 5. Create deliveries for each pharmacy
      const deliveryRows = selectedPharmaciesOrdered.map((ap) => {
        const items = pharmacyPackages[ap.pharmacy_id] || [];
        const nbCartons = items.filter(c => c.type === 'carton').length;
        const nbSachets = items.filter(c => c.type === 'sachet').length;
        const nbBarques = items.filter(c => c.type === 'bac').length;
        const reference = `${parcoursName.trim()}-${ap.pharmacy.name}`.substring(0, 50);
        const hasActiveAccount = activePharmacyIds.has(ap.pharmacy_id);

        return {
          parcours_id: parcoursId,
          pharmacy_id: ap.pharmacy_id,
          driver_id: selectedDriver,
          reference,
          nb_cartons: nbCartons,
          nb_sachets: nbSachets,
          nb_barques: nbBarques,
          packages: items.map(c => ({ barcode: c.barcode.trim(), type: c.type })),
          status: 'en_attente' as const,
          verification_code: hasActiveAccount ? generateCode() : null,
          site_id: siteId,
        };
      });

      if (deliveryRows.length > 0) {
        const { error: delivError } = await supabase
          .from('deliveries')
          .insert(deliveryRows as any);

        if (delivError) throw delivError;
      }

      toast.success(`Parcours "${parcoursName}" créé avec ${colisRows.length} colis et ${deliveryRows.length} livraison(s)`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de la création du parcours');
    } finally {
      setIsSaving(false);
    }
  };

  const addColis = (pharmacyId: string) => {
    setPharmacyPackages(prev => ({
      ...prev,
      [pharmacyId]: [...(prev[pharmacyId] || []), { id: newColisId(), type: 'carton', barcode: '' }],
    }));
  };

  const removeColis = (pharmacyId: string, colisId: string) => {
    setPharmacyPackages(prev => ({
      ...prev,
      [pharmacyId]: (prev[pharmacyId] || []).filter(c => c.id !== colisId),
    }));
  };

  const updateColis = (pharmacyId: string, colisId: string, field: 'type' | 'barcode', value: string) => {
    setPharmacyPackages(prev => ({
      ...prev,
      [pharmacyId]: (prev[pharmacyId] || []).map(c =>
        c.id === colisId ? { ...c, [field]: value } : c
      ),
    }));
  };

  const togglePharmacy = (pharmacyId: string) => {
    setSelectedPharmacyIds(prev => {
      const next = new Set(prev);
      if (next.has(pharmacyId)) {
        next.delete(pharmacyId);
      } else {
        next.add(pharmacyId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPharmacyIds.size === axisPharmacies.length) {
      setSelectedPharmacyIds(new Set());
    } else {
      setSelectedPharmacyIds(new Set(axisPharmacies.map(p => p.pharmacy_id)));
    }
  };

  const selectedAxisData = axes.find(a => a.id === selectedAxis);

  // Get selected pharmacies in axis order for step 3
  const selectedPharmaciesOrdered = axisPharmacies.filter(ap => selectedPharmacyIds.has(ap.pharmacy_id));

  const totalColis = Object.values(pharmacyPackages).flat().length;

  const stepLabels = [
    { label: 'Informations', icon: Route },
    { label: 'Pharmacies', icon: Building2 },
    { label: 'Colis', icon: Package },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Route className="w-5 h-5 text-primary" />
            Créer un parcours
          </DialogTitle>
          <DialogDescription>
            Configurez un parcours de livraisons en quelques étapes
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-1">
            {stepLabels.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors shrink-0',
                    step > i
                      ? 'bg-primary/20 text-primary'
                      : step === i
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > i ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={cn(
                  'text-xs font-medium truncate hidden sm:inline',
                  step >= i ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div className={cn(
                    'h-px flex-1 mx-1',
                    step > i ? 'bg-primary/40' : 'bg-muted'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="px-6 pb-6">
            {/* ===== STEP 1: Basic info ===== */}
            {step === 0 && (
              <div className="animate-fade-in">
                <div className="space-y-5">
                  <Card className="border-dashed">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <Label htmlFor="parcours-name" className="flex items-center gap-2 text-sm font-semibold">
                        <Route className="w-4 h-4 text-primary" />
                        Nom du parcours
                      </Label>
                      <Input
                        id="parcours-name"
                        placeholder="Ex: Tournée Nord Matin"
                        value={parcoursName}
                        onChange={(e) => setParcoursName(e.target.value)}
                        maxLength={100}
                      />
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <MapPin className="w-4 h-4 text-primary" />
                        Axe de livraison
                      </Label>
                      <Select value={selectedAxis} onValueChange={setSelectedAxis}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un axe" />
                        </SelectTrigger>
                        <SelectContent>
                          {axes.map((axis) => (
                            <SelectItem key={axis.id} value={axis.id}>
                              {axis.name}
                              {axis.description && (
                                <span className="text-muted-foreground ml-1">— {axis.description}</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedAxisData?.description && (
                        <p className="text-xs text-muted-foreground">{selectedAxisData.description}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <User className="w-4 h-4 text-primary" />
                        Chauffeur
                      </Label>
                      <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un chauffeur" />
                        </SelectTrigger>
                        <SelectContent>
                          {drivers.map((driver) => (
                            <SelectItem key={driver.user_id} value={driver.user_id}>
                              {driver.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button onClick={handleGoToStep2} disabled={!isStep1Valid} className="min-w-[140px]">
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* ===== STEP 2: Pharmacy selection ===== */}
            {step === 1 && (
              <div className="animate-fade-in">
                {loadingPharmacies ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : axisPharmacies.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Aucune pharmacie associée à cet axe</p>
                    <p className="text-xs mt-1">Ajoutez des pharmacies à l'axe depuis la gestion des axes</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        {selectedPharmacyIds.size}/{axisPharmacies.length} pharmacie{axisPharmacies.length > 1 ? 's' : ''} sélectionnée{selectedPharmacyIds.size > 1 ? 's' : ''}
                      </span>
                      <Button variant="ghost" size="sm" onClick={toggleAll}>
                        {selectedPharmacyIds.size === axisPharmacies.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      {axisPharmacies.map((ap, index) => {
                        const isSelected = selectedPharmacyIds.has(ap.pharmacy_id);
                        return (
                          <Card
                            key={ap.id}
                            className={cn(
                              'cursor-pointer transition-all duration-200 hover:shadow-md',
                              isSelected
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border hover:border-muted-foreground/30'
                            )}
                            onClick={() => togglePharmacy(ap.pharmacy_id)}
                          >
                            <CardContent className="py-3 px-4 flex items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => togglePharmacy(ap.pharmacy_id)}
                                className="shrink-0"
                              />
                              <div className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                              )}>
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">{ap.pharmacy.name}</p>
                                {ap.pharmacy.address && (
                                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    {ap.pharmacy.address}
                                  </p>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(0)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                  </Button>
                  <Button onClick={handleGoToStep3} disabled={!isStep2Valid} className="min-w-[140px]">
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* ===== STEP 3: Packages per pharmacy ===== */}
            {step === 2 && (
              <div className="animate-fade-in">
                {/* Summary bar */}
                <div className="flex items-center justify-between mb-4 px-1">
                  <span className="text-sm text-muted-foreground">
                    {selectedPharmaciesOrdered.length} pharmacie{selectedPharmaciesOrdered.length > 1 ? 's' : ''} · {totalColis} colis
                  </span>
                </div>

                {/* Pharmacy cards with colis */}
                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                  {selectedPharmaciesOrdered.map((ap, index) => {
                    const items = pharmacyPackages[ap.pharmacy_id] || [];
                    return (
                      <Card key={ap.pharmacy_id} className="border shadow-sm">
                        <CardContent className="pt-4 pb-4 space-y-3">
                          {/* Pharmacy header */}
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{ap.pharmacy.name}</p>
                              {ap.pharmacy.address && (
                                <p className="text-xs text-muted-foreground truncate">{ap.pharmacy.address}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {items.length} colis
                            </span>
                          </div>

                          {/* Colis list */}
                          {items.length > 0 && (
                            <div className="space-y-2 pl-9">
                              {items.map((colis) => {
                                const duplicate = isDuplicateBarcode(colis.barcode, colis.id);
                                const empty = colis.barcode.trim() === '';
                                return (
                                  <div key={colis.id} className="flex items-center gap-2">
                                    <Select
                                      value={colis.type}
                                      onValueChange={(val) => updateColis(ap.pharmacy_id, colis.id, 'type', val)}
                                    >
                                      <SelectTrigger className="w-[110px] h-9 text-xs shrink-0">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="carton">Carton</SelectItem>
                                        <SelectItem value="sachet">Sachet</SelectItem>
                                        <SelectItem value="bac">Bac</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex-1 relative">
                                      <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                      <Input
                                        placeholder="Code-barres"
                                        value={colis.barcode}
                                        onChange={(e) => updateColis(ap.pharmacy_id, colis.id, 'barcode', e.target.value)}
                                        className={cn(
                                          'h-9 text-xs pl-8',
                                          duplicate && 'border-destructive focus-visible:ring-destructive'
                                        )}
                                        maxLength={100}
                                      />
                                      {duplicate && (
                                        <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-destructive" />
                                      )}
                                    </div>
                                    <BarcodeScanButton
                                      className="h-9 w-9"
                                      onScan={(code) => updateColis(ap.pharmacy_id, colis.id, 'barcode', code)}
                                    />

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => removeColis(ap.pharmacy_id, colis.id)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Add colis button */}
                          <div className="pl-9">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs w-full border-dashed"
                              onClick={() => addColis(ap.pharmacy_id)}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Ajouter un colis
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Navigation */}
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                  </Button>
                  <Button
                    onClick={handleValidate}
                    disabled={!isStep3Valid || isSaving}
                    className="min-w-[160px]"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Création...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Valider le parcours
                      </>
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
