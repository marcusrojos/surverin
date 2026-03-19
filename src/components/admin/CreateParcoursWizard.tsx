import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { ArrowRight, Route, MapPin, User, Loader2 } from 'lucide-react';
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

  const [parcoursName, setParcoursName] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');

  useEffect(() => {
    if (open) {
      setStep(0);
      setParcoursName('');
      setSelectedAxis('');
      setSelectedDriver('');
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

  const isStep1Valid = parcoursName.trim() !== '' && selectedAxis !== '' && selectedDriver !== '';

  const handleNext = () => {
    if (step === 0 && isStep1Valid) {
      // For now, step 1 is the only step — future steps will be added
      toast.success(`Parcours "${parcoursName}" prêt — étapes suivantes à venir`);
      onOpenChange(false);
      onCreated();
    }
  };

  const selectedAxisData = axes.find(a => a.id === selectedAxis);
  const selectedDriverData = drivers.find(d => d.user_id === selectedDriver);

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
          <div className="flex items-center gap-2">
            {[1].map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                    step >= i
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {s}
                </div>
                <span className={cn(
                  'text-sm font-medium',
                  step >= i ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  Informations
                </span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="px-6 pb-6 overflow-hidden">
            {/* Step 1: Basic info */}
            <div
              className={cn(
                'transition-all duration-300',
                step === 0 ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              <div className="space-y-5">
                {/* Parcours Name */}
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

                {/* Axis Selection */}
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

                {/* Driver Selection */}
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

              {/* Next button */}
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleNext}
                  disabled={!isStep1Valid}
                  className="min-w-[140px]"
                >
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
