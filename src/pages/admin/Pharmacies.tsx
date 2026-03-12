import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search, Building2, Loader2, User, Eye, EyeOff, MapPin, Filter, ArrowUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PharmacyLocationPicker } from '@/components/PharmacyLocationPicker';

interface Pharmacy {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  user_id: string | null;
  client_code: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_source: string | null;
  _is_active?: boolean;
  _axis_position?: number | null;
}

type AccountFilter = 'all' | 'with_active' | 'with_inactive' | 'no_account';
type SortMode = 'alphabetical' | 'axis_order';

export default function PharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    password: '',
    client_code: '',
    latitude: null as number | null,
    longitude: null as number | null,
    location_source: null as string | null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPharmacies();
  }, []);

  const fetchPharmacies = async () => {
    try {
      const [pharmaciesRes, profilesRes, axisPharmaciesRes] = await Promise.all([
        supabase.from('pharmacies').select('*').order('name'),
        supabase.from('profiles').select('user_id, is_active'),
        supabase.from('axis_pharmacies').select('pharmacy_id, position'),
      ]);

      if (pharmaciesRes.error) throw pharmaciesRes.error;

      const profileStatuses = new Map<string, boolean>();
      (profilesRes.data || []).forEach((p: any) => {
        profileStatuses.set(p.user_id, p.is_active ?? true);
      });

      // Use lowest position across all axes for sorting
      const axisPositionMap = new Map<string, number>();
      (axisPharmaciesRes.data || []).forEach((ap: any) => {
        const existing = axisPositionMap.get(ap.pharmacy_id);
        if (existing === undefined || ap.position < existing) {
          axisPositionMap.set(ap.pharmacy_id, ap.position);
        }
      });

      setPharmacies((pharmaciesRes.data || []).map(p => ({
        ...p,
        _is_active: p.user_id ? (profileStatuses.get(p.user_id!) ?? true) : undefined,
        _axis_position: axisPositionMap.get(p.id) ?? null,
      })));
    } catch (error) {
      toast.error('Erreur lors du chargement des pharmacies');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (pharmacy?: Pharmacy) => {
    if (pharmacy) {
      setSelectedPharmacy(pharmacy);
      setFormData({
        name: pharmacy.name,
        address: pharmacy.address || '',
        phone: pharmacy.phone || '',
        email: pharmacy.email || '',
        password: '',
        client_code: pharmacy.client_code || '',
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude,
        location_source: pharmacy.location_source,
      });
    } else {
      setSelectedPharmacy(null);
      setFormData({ name: '', address: '', phone: '', email: '', password: '', client_code: '', latitude: null, longitude: null, location_source: null });
    }
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleTogglePharmacyActive = async (pharmacy: Pharmacy) => {
    if (!pharmacy.user_id) return;
    setTogglingId(pharmacy.id);
    try {
      const current = pharmacy._is_active ?? true;
      const newStatus = !current;
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newStatus } as any)
        .eq('user_id', pharmacy.user_id);

      if (error) throw error;

      setPharmacies(prev => prev.map(p => 
        p.id === pharmacy.id ? { ...p, _is_active: newStatus } : p
      ));
      toast.success(newStatus ? 'Compte pharmacie réactivé' : 'Compte pharmacie désactivé');
    } catch {
      toast.error('Erreur lors de la modification du statut');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom de la pharmacie est requis');
      return;
    }

    if (!selectedPharmacy && !formData.client_code.trim()) {
      toast.error('Le code client est requis');
      return;
    }

    // Check client code uniqueness
    const codeToCheck = formData.client_code.trim();
    if (codeToCheck) {
      const existing = pharmacies.find(
        p => p.client_code === codeToCheck && p.id !== selectedPharmacy?.id
      );
      if (existing) {
        toast.error(`Le code client "${codeToCheck}" est déjà utilisé par "${existing.name}"`);
        return;
      }
    }

    // Validate required fields for new pharmacy with account
    if (!selectedPharmacy && formData.password) {
      if (!formData.email.trim()) {
        toast.error("L'email est requis pour créer un compte");
        return;
      }
      if (formData.password.length < 6) {
        toast.error('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
    }

    setIsSaving(true);
    try {
      if (selectedPharmacy) {
        // Update existing pharmacy
        const updateData: any = {
          name: formData.name.trim(),
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          latitude: formData.latitude,
          longitude: formData.longitude,
          location_source: formData.location_source,
        };
        if (formData.client_code.trim()) {
          updateData.client_code = formData.client_code.trim();
        }
        const { error } = await supabase
          .from('pharmacies')
          .update(updateData)
          .eq('id', selectedPharmacy.id);

        if (error) {
          if (error.message?.includes('pharmacies_client_code_unique')) {
            toast.error('Ce code client est déjà utilisé par une autre pharmacie');
            setIsSaving(false);
            return;
          }
          throw error;
        }

        // If pharmacy has account and password provided, update password
        if (formData.password && selectedPharmacy.user_id) {
          if (formData.password.length < 6) {
            toast.error('Le mot de passe doit contenir au moins 6 caractères');
            setIsSaving(false);
            return;
          }
          const { data: pwData, error: pwError } = await supabase.functions.invoke('update-password', {
            body: { user_id: selectedPharmacy.user_id, password: formData.password },
          });
          if (pwError || pwData?.error) {
            toast.error(pwData?.error || 'Erreur lors de la mise à jour du mot de passe');
            setIsSaving(false);
            return;
          }
          toast.success('Pharmacie modifiée et mot de passe mis à jour');
        } else if (formData.password && !selectedPharmacy.user_id) {
          // Create account for pharmacy without one
          const { data, error: userError } = await supabase.functions.invoke('create-user', {
            body: {
              email: formData.email.trim(),
              password: formData.password,
              full_name: formData.name.trim(),
              role: 'pharmacie',
              pharmacy_id: selectedPharmacy.id,
            },
          });

          if (userError || data?.error) {
            toast.error(data?.error || 'Erreur lors de la création du compte');
            setIsSaving(false);
            return;
          }
          toast.success('Pharmacie modifiée et compte créé');
        } else {
          toast.success('Pharmacie modifiée avec succès');
        }
      } else {
        // Create new pharmacy first
        const { data: newPharmacy, error } = await supabase
          .from('pharmacies')
          .insert({
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            client_code: formData.client_code.trim(),
            latitude: formData.latitude,
            longitude: formData.longitude,
            location_source: formData.location_source,
          } as any)
          .select()
          .single();

        if (error) {
          if (error.message?.includes('pharmacies_client_code_unique')) {
            toast.error('Ce code client est déjà utilisé par une autre pharmacie');
            setIsSaving(false);
            return;
          }
          throw error;
        }

        // If password provided, create user account and link to pharmacy
        if (formData.password && formData.email.trim()) {
          const { data, error: userError } = await supabase.functions.invoke('create-user', {
            body: {
              email: formData.email.trim(),
              password: formData.password,
              full_name: formData.name.trim(),
              role: 'pharmacie',
              pharmacy_id: newPharmacy.id,
            },
          });

          if (userError || data?.error) {
            toast.error(data?.error || 'Pharmacie créée mais erreur lors de la création du compte');
          } else {
            toast.success('Pharmacie et compte créés avec succès');
          }
        } else {
          toast.success('Pharmacie créée avec succès');
        }
      }

      setIsDialogOpen(false);
      fetchPharmacies();
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPharmacy) return;

    try {
      // If pharmacy has a linked user, delete the auth user first
      if (selectedPharmacy.user_id) {
        const { data, error: fnError } = await supabase.functions.invoke('delete-user', {
          body: { userId: selectedPharmacy.user_id },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
      }

      // Delete axis_pharmacies links first
      await supabase
        .from('axis_pharmacies')
        .delete()
        .eq('pharmacy_id', selectedPharmacy.id);

      // Then delete the pharmacy record
      const { error } = await supabase
        .from('pharmacies')
        .delete()
        .eq('id', selectedPharmacy.id);

      if (error) throw error;
      toast.success('Pharmacie supprimée');
      setIsDeleteDialogOpen(false);
      fetchPharmacies();
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Impossible de supprimer: des livraisons sont associées à cette pharmacie');
      } else {
        toast.error(error?.message || 'Erreur lors de la suppression');
      }
    }
  };

  const filteredAndSortedPharmacies = pharmacies
    .filter(p => {
      // Text search
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.client_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Account filter
      switch (accountFilter) {
        case 'with_active':
          return p.user_id !== null && p._is_active === true;
        case 'with_inactive':
          return p.user_id !== null && p._is_active === false;
        case 'no_account':
          return p.user_id === null;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (sortMode === 'axis_order') {
        // Pharmacies with axis position first, then by position, then alphabetical for unpositioned
        if (a._axis_position !== null && b._axis_position !== null) {
          return a._axis_position - b._axis_position;
        }
        if (a._axis_position !== null) return -1;
        if (b._axis_position !== null) return 1;
      }
      return a.name.localeCompare(b.name, 'fr');
    });

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Pharmacies</h1>
            <p className="text-muted-foreground mt-1">
              Gérez les pharmacies destinataires
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="shadow-primary">
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle Pharmacie
          </Button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une pharmacie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={accountFilter} onValueChange={(v) => setAccountFilter(v as AccountFilter)}>
            <SelectTrigger className="w-full sm:w-52">
              <Filter className="w-4 h-4 mr-2 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="with_active">Compte actif</SelectItem>
              <SelectItem value="with_inactive">Compte désactivé</SelectItem>
              <SelectItem value="no_account">Sans compte</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-full sm:w-52">
              <ArrowUpDown className="w-4 h-4 mr-2 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical">Ordre alphabétique</SelectItem>
              <SelectItem value="axis_order">Ordre de l'axe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredAndSortedPharmacies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune pharmacie trouvée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {sortMode === 'axis_order' && <TableHead className="w-16">Pos.</TableHead>}
                  <TableHead>Nom</TableHead>
                  <TableHead>Code Client</TableHead>
                  <TableHead className="hidden md:table-cell">Adresse</TableHead>
                  <TableHead className="hidden lg:table-cell">Téléphone</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Compte</TableHead>
                  <TableHead className="hidden md:table-cell">Statut</TableHead>
                  <TableHead className="hidden md:table-cell">GPS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedPharmacies.map((pharmacy) => (
                  <TableRow key={pharmacy.id}>
                    {sortMode === 'axis_order' && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {pharmacy._axis_position !== null ? pharmacy._axis_position + 1 : '-'}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{pharmacy.name}</TableCell>
                    <TableCell className="font-mono text-sm text-primary font-semibold">{pharmacy.client_code}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {pharmacy.address || '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {pharmacy.phone || '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {pharmacy.email || '-'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {pharmacy.user_id ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                          pharmacy._is_active 
                            ? 'text-green-600 bg-green-500/10' 
                            : 'text-destructive bg-destructive/10'
                        }`}>
                          <User className="w-3 h-3" />
                          {pharmacy._is_active ? 'Actif' : 'Désactivé'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sans compte</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {pharmacy.user_id && (
                        <Switch
                          checked={pharmacy._is_active ?? true}
                          onCheckedChange={() => handleTogglePharmacyActive(pharmacy)}
                          disabled={togglingId === pharmacy.id}
                        />
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {pharmacy.latitude && pharmacy.longitude ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                          <MapPin className="w-3 h-3" />
                          Oui
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(pharmacy)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelectedPharmacy(pharmacy);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedPharmacy ? 'Modifier la pharmacie' : 'Nouvelle pharmacie'}
              </DialogTitle>
              <DialogDescription>
                {selectedPharmacy
                  ? 'Modifiez les informations de la pharmacie'
                  : 'Ajoutez une nouvelle pharmacie destinataire'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nom de la pharmacie"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_code">Code Client *</Label>
                <Input
                  id="client_code"
                  value={formData.client_code}
                  onChange={(e) => setFormData({ ...formData, client_code: e.target.value })}
                  placeholder="Ex: PH-00001 ou code personnalisé"
                />
              </div>
              {/* Location Picker */}
              <PharmacyLocationPicker
                initialLat={formData.latitude}
                initialLng={formData.longitude}
                initialAddress={formData.address}
                onLocationSelect={(loc) => {
                  setFormData({
                    ...formData,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    location_source: loc.source,
                  });
                }}
              />
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Adresse de la pharmacie"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="06 12 34 56 78"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email {formData.password && '*'}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@pharmacie.fr"
                  />
                </div>
              </div>
              
              {/* Password field for creating pharmacy user account */}
              {(!selectedPharmacy || !selectedPharmacy.user_id) && (
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="password">
                    Mot de passe du compte
                    {!selectedPharmacy && ' (optionnel)'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {selectedPharmacy 
                      ? 'Créer un compte pour permettre à cette pharmacie de se connecter et voir ses livraisons'
                      : 'Laisser vide si vous ne souhaitez pas créer de compte pour cette pharmacie'}
                  </p>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              
              {selectedPharmacy?.user_id && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="p-3 bg-green-500/10 rounded-lg text-sm text-green-600 flex items-center gap-2 mb-2">
                    <User className="w-4 h-4" />
                    Cette pharmacie possède un compte actif
                  </div>
                  <Label htmlFor="password">Nouveau mot de passe</Label>
                  <p className="text-xs text-muted-foreground">
                    Laisser vide pour ne pas modifier le mot de passe
                  </p>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedPharmacy ? 'Enregistrer' : 'Créer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer la pharmacie "{selectedPharmacy?.name}" ? 
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
