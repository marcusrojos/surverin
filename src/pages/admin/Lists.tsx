import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Download, Truck, Building2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createPdf, sectionTitle, table, field, finalizePdf, type TableColumn } from '@/lib/pdf-kit';
import { useSiteFilter, SiteFilterSelect } from '@/components/admin/SiteFilter';

interface DriverInfo {
  full_name: string;
  email: string;
  username: string | null;
  site_id: string | null;
}

interface PharmacyInfo {
  name: string;
  client_code: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  profile_email: string | null;
  site_id: string | null;
}

interface DeliveryByDriver {
  driver_name: string;
  driver_email: string;
  site_id: string | null;
  deliveries: {
    reference: string;
    pharmacy_name: string;
    pharmacy_address: string | null;
    verification_code: string | null;
    status: string;
    created_at: string;
    delivered_at: string | null;
    nb_cartons: number;
    nb_sachets: number;
    nb_barques: number;
  }[];
}




export default function AdminLists() {
  const { role } = useAuth();
  const { isSuperAdmin, sites, siteFilter, setSiteFilter } = useSiteFilter();
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyInfo[]>([]);
  const [deliveriesByDriver, setDeliveriesByDriver] = useState<DeliveryByDriver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== 'admin' && role !== 'super_admin') {
      navigate('/');
      return;
    }
    fetchData();
  }, [role]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: driverRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'livreur');

      if (driverRoles && driverRoles.length > 0) {
        const driverIds = driverRoles.map(r => r.user_id);
        const { data: driverProfiles } = await supabase
          .from('profiles')
          .select('full_name, email, username, site_id')
          .in('user_id', driverIds);
        setDrivers((driverProfiles as DriverInfo[]) || []);
      }

      const { data: pharmaData } = await supabase
        .from('pharmacies')
        .select('name, client_code, address, email, phone, user_id, site_id');

      if (pharmaData) {
        const pharmaWithPasswords: PharmacyInfo[] = [];
        for (const p of pharmaData) {
          let profile_email: string | null = null;
          if (p.user_id) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('email')
              .eq('user_id', p.user_id)
              .single();
            if (prof) {
              profile_email = prof.email;
            }
          }
          pharmaWithPasswords.push({
            name: p.name,
            client_code: p.client_code,
            address: p.address,
            email: p.email,
            phone: p.phone,
            profile_email,
            site_id: (p as any).site_id ?? null,
          });
        }
        setPharmacies(pharmaWithPasswords);
      }

      const { data: allDeliveries } = await supabase
        .from('deliveries')
        .select('reference, pharmacy_id, verification_code, status, created_at, delivered_at, driver_id, nb_cartons, nb_sachets, nb_barques')
        .order('created_at', { ascending: false });

      if (allDeliveries) {
        const uniqueDriverIds = [...new Set(allDeliveries.map(d => d.driver_id).filter(Boolean))] as string[];
        
        const { data: dProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, site_id')
          .in('user_id', uniqueDriverIds.length > 0 ? uniqueDriverIds : ['none']);

        const { data: allPharmacies } = await supabase
          .from('pharmacies')
          .select('id, name, address');

        const pharmaMap = new Map((allPharmacies || []).map(p => [p.id, { name: p.name, address: p.address }]));
        const driverMap = new Map((dProfiles || []).map(p => [p.user_id, { name: p.full_name, email: p.email, site_id: (p as any).site_id ?? null }]));

        const grouped: Record<string, DeliveryByDriver> = {};
        for (const d of allDeliveries) {
          const driverId = d.driver_id || 'non_assigne';
          if (!grouped[driverId]) {
            const dInfo = driverMap.get(driverId);
            grouped[driverId] = {
              driver_name: dInfo?.name || 'Non assigné',
              driver_email: dInfo?.email || '',
              site_id: dInfo?.site_id ?? null,
              deliveries: [],
            };
          }
          const pharmaInfo = pharmaMap.get(d.pharmacy_id);
          grouped[driverId].deliveries.push({
            reference: d.reference,
            pharmacy_name: pharmaInfo?.name || 'Inconnue',
            pharmacy_address: pharmaInfo?.address || null,
            verification_code: d.verification_code,
            status: d.status,
            created_at: d.created_at,
            delivered_at: d.delivered_at,
            nb_cartons: d.nb_cartons,
            nb_sachets: d.nb_sachets,
            nb_barques: d.nb_barques,
          });
        }
        setDeliveriesByDriver(Object.values(grouped));
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }

  async function downloadDriversPDF() {
    if (displayDrivers.length === 0) { toast.error('Aucun chauffeur à exporter'); return; }
    const ctx = await createPdf('Liste des chauffeurs', 'p');
    field(ctx, 'Total :', `${displayDrivers.length} chauffeur(s)`, true);
    sectionTitle(ctx, 'CHAUFFEURS');
    const columns: TableColumn[] = [
      { header: 'Nom complet', width: 45 },
      { header: 'Email', width: 55 },
      { header: 'Username', width: 35 },
    ];
    table(
      ctx,
      columns,
      displayDrivers.map((d) => [d.full_name || '—', d.email || '—', d.username || '—'])
    );
    finalizePdf(ctx, 'liste-chauffeurs.pdf');
    toast.success('PDF chauffeurs téléchargé');
  }

  async function downloadPharmaciesPDF() {
    if (displayPharmacies.length === 0) { toast.error('Aucune pharmacie à exporter'); return; }
    const ctx = await createPdf('Liste des pharmacies', 'l');
    field(ctx, 'Total :', `${displayPharmacies.length} pharmacie(s)`, true);
    sectionTitle(ctx, 'PHARMACIES');
    const columns: TableColumn[] = [
      { header: 'Pharmacie', width: 50 },
      { header: 'Code', width: 25 },
      { header: 'Email compte', width: 55 },
      { header: 'Adresse', width: 60 },
      { header: 'Téléphone', width: 35 },
    ];
    table(
      ctx,
      columns,
      displayPharmacies.map((p) => [
        p.name || '—',
        p.client_code || '—',
        p.profile_email || p.email || '—',
        p.address || '—',
        p.phone || '—',
      ])
    );
    finalizePdf(ctx, 'liste-pharmacies.pdf');
    toast.success('PDF pharmacies téléchargé');
  }

  async function downloadDeliveriesPDF(groups?: DeliveryByDriver[]) {
    const data = groups || deliveriesByDriver;
    if (data.length === 0) { toast.error('Aucune livraison à exporter'); return; }

    const isSingle = data.length === 1;
    const title = isSingle ? `Livraisons — ${data[0].driver_name}` : 'Livraisons par chauffeur';

    const filterParts: string[] = [];
    if (selectedDriverId !== 'all') filterParts.push(`Livreur : ${selectedDriverId}`);
    if (selectedStatus !== 'all') filterParts.push(`Statut : ${selectedStatus === 'livre' ? 'Livré' : 'En attente'}`);
    if (selectedDate) filterParts.push(`Date : ${new Date(selectedDate).toLocaleDateString('fr-FR')}`);

    const ctx = await createPdf(title, 'l', filterParts.length > 0 ? `Filtres : ${filterParts.join('  ·  ')}` : undefined);

    const columns: TableColumn[] = [
      { header: 'Référence', width: 28 },
      { header: 'Pharmacie', width: 50 },
      { header: 'Adresse', width: 50 },
      { header: 'Code vérif.', width: 25 },
      { header: 'Colis', width: 20 },
      { header: 'Statut', width: 22, align: 'center' },
      { header: 'Date', width: 25 },
    ];

    for (const group of data) {
      const totalLivraisons = group.deliveries.length;
      const totalLivrees = group.deliveries.filter((d) => d.status === 'livre').length;
      const totalAttente = totalLivraisons - totalLivrees;
      sectionTitle(ctx, `${group.driver_name}`);
      field(ctx, 'Email :', group.driver_email || '—');
      field(ctx, 'Synthèse :', `${totalLivraisons} livraison(s) · ${totalLivrees} livrée(s) · ${totalAttente} en attente`);
      table(
        ctx,
        columns,
        group.deliveries.map((del) => {
          const colisStr = [
            del.nb_cartons > 0 ? `${del.nb_cartons}C` : '',
            del.nb_sachets > 0 ? `${del.nb_sachets}S` : '',
            del.nb_barques > 0 ? `${del.nb_barques}B` : '',
          ].filter(Boolean).join(' ') || '—';
          const dateStr = del.delivered_at
            ? new Date(del.delivered_at).toLocaleDateString('fr-FR')
            : new Date(del.created_at).toLocaleDateString('fr-FR');
          return [
            del.reference,
            del.pharmacy_name,
            del.pharmacy_address || '—',
            del.verification_code || '—',
            colisStr,
            del.status === 'livre' ? 'Livré' : 'En attente',
            dateStr,
          ];
        })
      );
    }

    const fileName = isSingle
      ? `livraisons-${data[0].driver_name.replace(/\s+/g, '-').toLowerCase()}.pdf`
      : 'livraisons-par-chauffeur.pdf';
    finalizePdf(ctx, fileName);
    toast.success('PDF livraisons téléchargé');
  }


  const displayDrivers = drivers.filter(d => siteFilter === 'all' || d.site_id === siteFilter);
  const displayPharmacies = pharmacies.filter(p => siteFilter === 'all' || p.site_id === siteFilter);
  const displayDeliveryGroups = deliveriesByDriver.filter(g => siteFilter === 'all' || g.site_id === siteFilter);

  const filteredDeliveryGroups = (() => {
    let groups = selectedDriverId === 'all'
      ? displayDeliveryGroups
      : displayDeliveryGroups.filter(g => g.driver_name === selectedDriverId);

    if (selectedStatus !== 'all' || selectedDate) {
      groups = groups.map(g => ({
        ...g,
        deliveries: g.deliveries.filter(d => {
          const statusMatch = selectedStatus === 'all' || d.status === selectedStatus;
          const dateMatch = !selectedDate || new Date(d.created_at).toISOString().slice(0, 10) === selectedDate;
          return statusMatch && dateMatch;
        }),
      })).filter(g => g.deliveries.length > 0);
    }
    return groups;
  })();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Listes & Documents</h1>
          {isSuperAdmin && (
            <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} sites={sites} />
          )}
        </div>

        <Tabs defaultValue="drivers">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="drivers" className="gap-2"><Truck className="w-4 h-4" /> Chauffeurs</TabsTrigger>
            <TabsTrigger value="pharmacies" className="gap-2"><Building2 className="w-4 h-4" /> Pharmacies</TabsTrigger>
            <TabsTrigger value="deliveries" className="gap-2"><Package className="w-4 h-4" /> Livraisons</TabsTrigger>
          </TabsList>

          <TabsContent value="drivers">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Liste des Chauffeurs</CardTitle>
                <Button onClick={downloadDriversPDF} variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" /> Télécharger PDF
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom complet</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Username</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayDrivers.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{d.full_name}</TableCell>
                          <TableCell>{d.email}</TableCell>
                          <TableCell>{d.username || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {displayDrivers.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Aucun chauffeur</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pharmacies">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Liste des Pharmacies</CardTitle>
                <Button onClick={downloadPharmaciesPDF} variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" /> Télécharger PDF
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pharmacie</TableHead>
                        <TableHead>Code client</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Adresse</TableHead>
                        <TableHead>Téléphone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayPharmacies.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono">{p.client_code}</TableCell>
                          <TableCell>{p.profile_email || p.email || '—'}</TableCell>
                          <TableCell>{p.address || '—'}</TableCell>
                          <TableCell>{p.phone || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {displayPharmacies.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aucune pharmacie</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deliveries">
            <Card>
              <CardHeader className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg">Livraisons par Chauffeur</CardTitle>
                  <Button
                    onClick={() => {
                      downloadDeliveriesPDF(filteredDeliveryGroups);
                    }}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" /> Télécharger PDF
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Tous les chauffeurs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les chauffeurs</SelectItem>
                      {displayDeliveryGroups.map((group, i) => (
                        <SelectItem key={i} value={group.driver_name}>
                          {group.driver_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="en_attente">En attente</SelectItem>
                      <SelectItem value="livre">Livré</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-[180px]"
                    placeholder="Filtrer par date"
                  />
                  {selectedDate && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDate('')}>
                      Effacer date
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {filteredDeliveryGroups.map((group, i) => (
                  <div key={i}>
                    <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-primary" />
                      {group.driver_name}
                      {group.driver_email && <span className="text-xs text-muted-foreground font-normal">({group.driver_email})</span>}
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Référence</TableHead>
                            <TableHead>Pharmacie</TableHead>
                            <TableHead>Code vérification</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.deliveries.map((d, j) => (
                            <TableRow key={j}>
                              <TableCell className="font-mono">{d.reference}</TableCell>
                              <TableCell>{d.pharmacy_name}</TableCell>
                              <TableCell className="font-mono font-bold">{d.verification_code || '—'}</TableCell>
                              <TableCell>{d.status === 'livre' ? '✅ Livré' : '⏳ En attente'}</TableCell>
                              <TableCell>{new Date(d.created_at).toLocaleDateString('fr-FR')}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
                {filteredDeliveryGroups.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Aucune livraison</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
