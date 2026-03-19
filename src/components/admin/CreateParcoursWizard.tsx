import { useState, useEffect } from 'react';
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
import { ArrowRight, ArrowLeft, Route, MapPin, User, Loader2, Building2, CheckCircle2 } from 'lucide-react';
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

interface CreateParcoursWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateParcoursWizard({ open, onOpenChange, onCreated }: CreateParcoursWizardProps) {
  const [step, setStep] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);

  const [parcoursName, setParcoursName] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');

  // Step 2
  const [axisPharmacies, setAxisPharmacies] = useState<AxisPharmacy[]>([]);
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setStep(0);
      setParcoursName('');
      setSelectedAxis('');
      setSelectedDriver('');
      setAxisPharmacies([]);
      setSelectedPharmacyIds(new Set());
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
      // Pre-select all pharmacies
      setSelectedPharmacyIds(new Set(mapped.map(p => p.pharmacy_id)));
    } catch {
      toast.error('Erreur lors du chargement des pharmacies');
    } finally {
      setLoadingPharmacies(false);
    }
  };

  const isStep1Valid = parcoursName.trim() !== '' && selectedAxis !== '' && selectedDriver !== '';
  const isStep2Valid = selectedPharmacyIds.size > 0;

  const handleGoToStep2 = () => {
    if (isStep1Valid) {
      setStep(1);
      fetchAxisPharmacies(selectedAxis);
    }
  };

  const handleNext = () => {
    if (step === 1 && isStep2Valid) {
      // Future steps will follow
      toast.success(`Parcours "${parcoursName}" prêt — étapes suivantes à venir`);
      onOpenChange(false);
      onCreated();
    }
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

  const steps = [
    { label: 'Informations', icon: Route },
    { label: 'Pharmacies', icon: Building2 },
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
            {steps.map((s, i) => (
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
                  'text-sm font-medium truncate',
                  step >= i ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
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
            {/* Step 1: Basic info */}
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
                  <Button
                    onClick={handleGoToStep2}
                    disabled={!isStep1Valid}
                    className="min-w-[140px]"
                  >
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Pharmacy selection */}
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
                    {/* Select all / counter */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        {selectedPharmacyIds.size}/{axisPharmacies.length} pharmacie{axisPharmacies.length > 1 ? 's' : ''} sélectionnée{selectedPharmacyIds.size > 1 ? 's' : ''}
                      </span>
                      <Button variant="ghost" size="sm" onClick={toggleAll}>
                        {selectedPharmacyIds.size === axisPharmacies.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </Button>
                    </div>

                    {/* Pharmacy cards */}
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
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">
                                  {ap.pharmacy.name}
                                </p>
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

                {/* Navigation buttons */}
                <div className="mt-6 flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setStep(0)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={!isStep2Valid}
                    className="min-w-[140px]"
                  >
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-2" />
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
