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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Pencil, Trash2, Search, Package, Loader2, Copy, Check, X, FileDown } from 'lucide-react';
import { generateReceiptPDF } from '@/lib/generate-receipt-pdf';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Pharmacy {
  id: string;
  name: string;
  address: string | null;
  client_code?: string;
  phone?: string | null;
  email?: string | null;
  user_id?: string | null;
}

interface Driver {
  user_id: string;
  full_name: string;
}

interface Delivery {
  id: string;
  reference: string;
  status: 'en_attente' | 'livre';
  pharmacy_id: string;
  driver_id: string | null;
  recipient_name: string | null;
  delivered_at: string | null;
  created_at: string;
  verification_code: string | null;
  pharmacy: { name: string } | null;
  driver: { full_name: string } | null;
}

const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pharmacyFilter, setPharmacyFilter] = useState<string>('all');
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [newVerificationCode, setNewVerificationCode] = useState<string>('');
  const [formData, setFormData] = useState({
    reference: '',
    pharmacy_id: '',
    driver_id: '',
  });
  const [formPackages, setFormPackages] = useState<{ type: string; reference: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      if (deliveriesError) throw deliveriesError;

      const { data: pharmaciesData } = await supabase
        .from('pharmacies')
        .select('id, name, address, client_code, phone, email, user_id')
        .order('name');

      const { data: driverRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'livreur');

      const driverIds = driverRoles?.map(r => r.user_id) || [];

      const { data: driversData } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', driverIds.length > 0 ? driverIds : ['no-match']);

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const mappedDeliveries = (deliveriesData || []).map(d => ({
        ...d,
        pharmacy: pharmaciesData?.find(p => p.id === d.pharmacy_id) || null,
        driver: allProfiles?.find(p => p.user_id === d.driver_id) || null,
      }));

      setDeliveries(mappedDeliveries as Delivery[]);
      setPharmacies(pharmaciesData || []);
      setDrivers(driversData || []);
    } catch (error) {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (delivery?: Delivery) => {
    if (delivery) {
      setSelectedDelivery(delivery);
      setFormData({
        reference: delivery.reference,
        pharmacy_id: delivery.pharmacy_id,
        driver_id: delivery.driver_id || '',
      });
      setFormPackages(((delivery as any).packages as any[]) || []);
    } else {
      setSelectedDelivery(null);
      setFormData({ reference: '', pharmacy_id: '', driver_id: '' });
      setFormPackages([]);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.reference.trim() || !formData.pharmacy_id) {
      toast.error('La référence et la pharmacie sont requises');
      return;
    }

    setIsSaving(true);
    try {
      const nb_cartons = formPackages.filter(p => p.type === 'carton').length;
      const nb_sachets = formPackages.filter(p => p.type === 'sachet').length;
      const nb_barques = formPackages.filter(p => p.type === 'barque').length;
      const packagesJson = JSON.stringify(formPackages);

      if (selectedDelivery) {
        const { error } = await supabase
          .from('deliveries')
          .update({
            reference: formData.reference.trim(),
            pharmacy_id: formData.pharmacy_id,
            driver_id: formData.driver_id || null,
            nb_cartons,
            nb_sachets,
            nb_barques,
            packages: packagesJson,
          } as any)
          .eq('id', selectedDelivery.id);

        if (error) throw error;
        toast.success('Livraison modifiée');
        setIsDialogOpen(false);
      } else {
        // Determine if pharmacy has an account — if not, no verification code
        const selectedPharmacy = pharmacies.find(p => p.id === formData.pharmacy_id);
        const verificationCode = selectedPharmacy?.user_id ? generateVerificationCode() : null;
        
        const { error } = await supabase
          .from('deliveries')
          .insert({
            reference: formData.reference.trim(),
            pharmacy_id: formData.pharmacy_id,
            driver_id: formData.driver_id || null,
            status: 'en_attente',
            verification_code: verificationCode,
            nb_cartons,
            nb_sachets,
            nb_barques,
            packages: packagesJson,
          } as any)
          .select()
          .single();

        if (error) {
          if (error.message?.includes('duplicate')) {
            toast.error('Cette référence existe déjà');
            setIsSaving(false);
            return;
          }
          throw error;
        }
        
        if (verificationCode) {
          setNewVerificationCode(verificationCode);
          setIsDialogOpen(false);
          setIsCodeDialogOpen(true);
        } else {
          toast.success('Livraison créée (sans code de vérification — pharmacie sans compte)');
          setIsDialogOpen(false);
        }
      }

      fetchData();
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDelivery) return;

    try {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', selectedDelivery.id);

      if (error) throw error;
      toast.success('Livraison supprimée');
      setIsDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const filteredDeliveries = deliveries.filter((d) => {
    const q = searchQuery.toLowerCase();
    let pkgs: any[] = [];
    try {
      const raw = (d as any).packages;
      pkgs = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : [];
    } catch { pkgs = []; }
    const matchesSearch =
      d.reference.toLowerCase().includes(q) ||
      d.pharmacy?.name.toLowerCase().includes(q) ||
      pkgs.some((pkg: any) => pkg.reference?.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchesPharmacy = pharmacyFilter === 'all' || d.pharmacy_id === pharmacyFilter;
    const matchesDriver = driverFilter === 'all' || d.driver_id === driverFilter;
    return matchesSearch && matchesStatus && matchesPharmacy && matchesDriver;
  });

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Livraisons</h1>
            <p className="text-muted-foreground mt-1">
              Gérez toutes les livraisons de colis
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="shadow-primary">
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle Livraison
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par référence, pharmacie ou code-barres colis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="livre">Livré</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pharmacyFilter} onValueChange={setPharmacyFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pharmacie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les pharmacies</SelectItem>
                {pharmacies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chauffeur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les chauffeurs</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.user_id} value={d.user_id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune livraison trouvée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Pharmacie</TableHead>
                  <TableHead className="hidden md:table-cell">Chauffeur</TableHead>
                  <TableHead className="hidden md:table-cell">Colis</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-mono font-medium">
                      {delivery.reference}
                    </TableCell>
                    <TableCell>{delivery.pharmacy?.name || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {delivery.driver?.full_name || 'Non assigné'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {(() => {
                        const d = delivery as any;
                        const parts: string[] = [];
                        if (d.nb_cartons > 0) parts.push(`${d.nb_cartons}C`);
                        if (d.nb_sachets > 0) parts.push(`${d.nb_sachets}S`);
                        if (d.nb_barques > 0) parts.push(`${d.nb_barques}B`);
                        return parts.length > 0 ? parts.join(' / ') : '-';
                      })()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={delivery.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {format(new Date(delivery.created_at), 'dd MMM yyyy', { locale: fr })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {delivery.status === 'livre' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Télécharger le bon de réception"
                            onClick={async () => {
                              try {
                                const d = delivery as any;
                                const ph = pharmacies.find(p => p.id === delivery.pharmacy_id);
                                await generateReceiptPDF({
                                  reference: delivery.reference,
                                  pharmacyName: delivery.pharmacy?.name || 'Inconnu',
                                  pharmacyAddress: ph?.address || null,
                                  pharmacyClientCode: ph?.client_code || null,
                                  pharmacyPhone: ph?.phone || null,
                                  pharmacyEmail: ph?.email || null,
                                  recipientName: d.recipient_name || 'Non renseigné',
                                  recipientSignature: d.recipient_signature || null,
                                  deliveredAt: d.delivered_at || delivery.created_at,
                                  createdAt: delivery.created_at,
                                  driverName: delivery.driver?.full_name || null,
                                  verificationCode: delivery.verification_code || null,
                                  nb_cartons: d.nb_cartons,
                                  nb_sachets: d.nb_sachets,
                                  nb_barques: d.nb_barques,
                                  nb_cartons_received: d.nb_cartons_received,
                                  nb_sachets_received: d.nb_sachets_received,
                                  nb_barques_received: d.nb_barques_received,
                                  packages: Array.isArray(d.packages) ? d.packages : [],
                                });
                              } catch (error) {
                                console.error('Erreur lors du téléchargement du bon:', error);
                                toast.error('Erreur lors de la génération du bon de réception');
                              }
                            }}
                          >
                            <FileDown className="w-4 h-4 text-primary" />
                          </Button>
                        )}
                        {delivery.status !== 'livre' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(delivery)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedDelivery(delivery);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
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
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedDelivery ? 'Modifier la livraison' : 'Nouvelle livraison'}
              </DialogTitle>
              <DialogDescription>
                {selectedDelivery
                  ? 'Modifiez les informations de la livraison'
                  : 'Créez une nouvelle livraison de colis'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reference">Référence (code-barres) *</Label>
                <Input
                  id="reference"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="ABC123456"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pharmacy">Pharmacie destinataire *</Label>
                <Select
                  value={formData.pharmacy_id}
                  onValueChange={(value) => setFormData({ ...formData, pharmacy_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une pharmacie" />
                  </SelectTrigger>
                  <SelectContent>
                    {pharmacies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Dynamic package list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Colis dans cette livraison</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormPackages([...formPackages, { type: 'carton', reference: '' }])}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter un colis
                  </Button>
                </div>
                {formPackages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                    Aucun colis ajouté. Cliquez sur "Ajouter un colis".
                  </p>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {formPackages.map((pkg, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={pkg.type}
                        onValueChange={(val) => {
                          const updated = [...formPackages];
                          updated[idx] = { ...updated[idx], type: val };
                          setFormPackages(updated);
                        }}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="carton">Carton</SelectItem>
                          <SelectItem value="sachet">Sachet</SelectItem>
                          <SelectItem value="barque">Barque</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={pkg.reference}
                        onChange={(e) => {
                          const updated = [...formPackages];
                          updated[idx] = { ...updated[idx], reference: e.target.value };
                          setFormPackages(updated);
                        }}
                        placeholder="Référence du colis"
                        className="font-mono flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive flex-shrink-0"
                        onClick={() => setFormPackages(formPackages.filter((_, i) => i !== idx))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {formPackages.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formPackages.filter(p => p.type === 'carton').length} carton(s), {formPackages.filter(p => p.type === 'sachet').length} sachet(s), {formPackages.filter(p => p.type === 'barque').length} barque(s)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver">Chauffeur assigné</Label>
                <Select
                  value={formData.driver_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, driver_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un chauffeur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non assigné</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedDelivery ? 'Enregistrer' : 'Créer'}
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
                Êtes-vous sûr de vouloir supprimer la livraison "{selectedDelivery?.reference}" ?
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

        {/* Verification Code Dialog */}
        <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-success flex items-center gap-2">
                <Check className="w-5 h-5" />
                Livraison créée avec succès
              </DialogTitle>
              <DialogDescription>
                Transmettez ce code de vérification à la pharmacie. Le livreur devra le saisir lors de la validation de la livraison.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <div className="flex items-center justify-center gap-4">
                <div className="text-2xl sm:text-4xl font-mono font-bold tracking-[0.3em] sm:tracking-[0.5em] bg-muted px-4 sm:px-6 py-4 rounded-lg break-all text-center">
                  {newVerificationCode}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(newVerificationCode);
                    toast.success('Code copié dans le presse-papiers');
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Ce code est unique à cette livraison et sera demandé au livreur pour confirmer la réception.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsCodeDialogOpen(false)} className="w-full">
                Compris
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
