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

interface DriverInfo {
  full_name: string;
  email: string;
  username: string | null;
  plain_password: string | null;
}

interface PharmacyInfo {
  name: string;
  client_code: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  profile_email: string | null;
  plain_password: string | null;
}

interface DeliveryByDriver {
  driver_name: string;
  driver_email: string;
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function addPDFHeader(doc: jsPDF, title: string): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  try {
    const logoImg = await loadImage(dpciLogo);
    const logoW = 20;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    doc.addImage(logoImg, 'WEBP', margin, y, logoW, logoH);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DPCI', margin + logoW + 5, y + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Livraison Express Pharmaceutique', margin + logoW + 5, y + 12);
    y += Math.max(logoH, 15) + 5;
  } catch {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DPCI', margin, y + 7);
    y += 15;
  }

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, y + 5, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 12;

  return y;
}

export default function AdminLists() {
  const { role } = useAuth();
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
          .select('full_name, email, username, plain_password')
          .in('user_id', driverIds);
        setDrivers((driverProfiles as DriverInfo[]) || []);
      }

      const { data: pharmaData } = await supabase
        .from('pharmacies')
        .select('name, client_code, address, email, phone, user_id');

      if (pharmaData) {
        const pharmaWithPasswords: PharmacyInfo[] = [];
        for (const p of pharmaData) {
          let profile_email: string | null = null;
          let plain_password: string | null = null;
          if (p.user_id) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('email, plain_password')
              .eq('user_id', p.user_id)
              .single();
            if (prof) {
              profile_email = prof.email;
              plain_password = (prof as any).plain_password;
            }
          }
          pharmaWithPasswords.push({
            name: p.name,
            client_code: p.client_code,
            address: p.address,
            email: p.email,
            phone: p.phone,
            profile_email,
            plain_password,
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
          .select('user_id, full_name, email')
          .in('user_id', uniqueDriverIds.length > 0 ? uniqueDriverIds : ['none']);

        const { data: allPharmacies } = await supabase
          .from('pharmacies')
          .select('id, name, address');

        const pharmaMap = new Map((allPharmacies || []).map(p => [p.id, { name: p.name, address: p.address }]));
        const driverMap = new Map((dProfiles || []).map(p => [p.user_id, { name: p.full_name, email: p.email }]));

        const grouped: Record<string, DeliveryByDriver> = {};
        for (const d of allDeliveries) {
          const driverId = d.driver_id || 'non_assigne';
          if (!grouped[driverId]) {
            const dInfo = driverMap.get(driverId);
            grouped[driverId] = {
              driver_name: dInfo?.name || 'Non assigné',
              driver_email: dInfo?.email || '',
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
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 15;
    let y = await addPDFHeader(doc, 'Liste des Chauffeurs');

    const colX = [margin, margin + 55, margin + 105, margin + 145];
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Nom complet', colX[0], y);
    doc.text('Email', colX[1], y);
    doc.text('Username', colX[2], y);
    doc.text('Mot de passe', colX[3], y);
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, 195, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const d of drivers) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(d.full_name || '', colX[0], y);
      doc.text(d.email || '', colX[1], y);
      doc.text(d.username || '—', colX[2], y);
      doc.text(d.plain_password || '—', colX[3], y);
      y += 6;
    }

    doc.save('liste-chauffeurs.pdf');
    toast.success('PDF chauffeurs téléchargé');
  }

  async function downloadPharmaciesPDF() {
    const doc = new jsPDF('l', 'mm', 'a4');
    const margin = 15;
    let y = await addPDFHeader(doc, 'Liste des Pharmacies');

    const colX = [margin, margin + 45, margin + 65, margin + 110, margin + 155, margin + 195];
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Pharmacie', colX[0], y);
    doc.text('Code', colX[1], y);
    doc.text('Email compte', colX[2], y);
    doc.text('Adresse', colX[3], y);
    doc.text('Téléphone', colX[4], y);
    doc.text('Mot de passe', colX[5], y);
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, 282, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const p of pharmacies) {
      if (y > 195) { doc.addPage(); y = 20; }
      doc.text(p.name || '', colX[0], y);
      doc.text(p.client_code || '', colX[1], y);
      doc.text(p.profile_email || p.email || '—', colX[2], y);
      doc.text((p.address || '—').substring(0, 40), colX[3], y);
      doc.text(p.phone || '—', colX[4], y);
      doc.text(p.plain_password || '—', colX[5], y);
      y += 6;
    }

    doc.save('liste-pharmacies.pdf');
    toast.success('PDF pharmacies téléchargé');
  }

  async function downloadDeliveriesPDF(groups?: DeliveryByDriver[]) {
    const data = groups || deliveriesByDriver;
    if (data.length === 0) { toast.error('Aucune livraison à exporter'); return; }
    
    const isSingle = data.length === 1;
    const title = isSingle ? `Livraisons — ${data[0].driver_name}` : 'Livraisons par Chauffeur';
    
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = await addPDFHeader(doc, title);

    const filterParts: string[] = [];
    if (selectedDriverId !== 'all') filterParts.push(`Livreur : ${selectedDriverId}`);
    if (selectedStatus !== 'all') filterParts.push(`Statut : ${selectedStatus === 'livre' ? 'Livré' : 'En attente'}`);
    if (selectedDate) filterParts.push(`Date : ${new Date(selectedDate).toLocaleDateString('fr-FR')}`);
    if (filterParts.length > 0) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`Filtres appliqués : ${filterParts.join(' | ')}`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    for (const group of data) {
      if (y > 170) { doc.addPage(); y = 20; }

      doc.setFillColor(240, 246, 255);
      doc.rect(margin, y - 4, pageWidth - margin * 2, 14, 'F');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 60, 130);
      doc.text(`🚚  ${group.driver_name}`, margin + 3, y + 4);
      if (group.driver_email) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Email : ${group.driver_email}`, margin + 3, y + 9);
      }
      const totalLivraisons = group.deliveries.length;
      const totalLivrees = group.deliveries.filter(d => d.status === 'livre').length;
      const totalAttente = totalLivraisons - totalLivrees;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Total : ${totalLivraisons} livraison(s)  |  Livrées : ${totalLivrees}  |  En attente : ${totalAttente}`,
        pageWidth - margin - 3, y + 4,
        { align: 'right' }
      );
      doc.setTextColor(0, 0, 0);
      y += 16;

      const colX = [margin + 2, margin + 28, margin + 78, margin + 118, margin + 155, margin + 183, margin + 210];
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text('Référence', colX[0], y);
      doc.text('Pharmacie', colX[1], y);
      doc.text('Adresse', colX[2], y);
      doc.text('Code vérif.', colX[3], y);
      doc.text('Colis', colX[4], y);
      doc.text('Statut', colX[5], y);
      doc.text('Date création', colX[6], y);
      y += 2;
      doc.setDrawColor(150, 150, 200);
      doc.setLineWidth(0.3);
      doc.line(margin + 2, y, pageWidth - margin, y);
      y += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      for (const del of group.deliveries) {
        if (y > 185) { doc.addPage(); y = 20; }
        const rowColor = group.deliveries.indexOf(del) % 2 === 0 ? [252, 252, 252] : [245, 245, 255];
        doc.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
        doc.rect(margin + 2, y - 3, pageWidth - margin * 2 - 2, 6, 'F');

        doc.setTextColor(0, 0, 0);
        doc.text(del.reference, colX[0], y);
        doc.text(del.pharmacy_name.substring(0, 28), colX[1], y);
        doc.text((del.pharmacy_address || '—').substring(0, 30), colX[2], y);
        doc.text(del.verification_code || '—', colX[3], y);
        const colisStr = [
          del.nb_cartons > 0 ? `${del.nb_cartons}C` : '',
          del.nb_sachets > 0 ? `${del.nb_sachets}S` : '',
          del.nb_barques > 0 ? `${del.nb_barques}B` : '',
        ].filter(Boolean).join(' ') || '—';
        doc.text(colisStr, colX[4], y);
        if (del.status === 'livre') {
          doc.setTextColor(0, 130, 60);
          doc.text('✓ Livré', colX[5], y);
        } else {
          doc.setTextColor(200, 100, 0);
          doc.text('⏳ Attente', colX[5], y);
        }
        doc.setTextColor(0, 0, 0);
        const dateCreation = new Date(del.created_at).toLocaleDateString('fr-FR');
        const dateLivraison = del.delivered_at ? new Date(del.delivered_at).toLocaleDateString('fr-FR') : '';
        doc.text(dateLivraison ? `${dateLivraison}` : dateCreation, colX[6], y);
        y += 6;
      }
      y += 6;
    }

    const fileName = isSingle
      ? `livraisons-${data[0].driver_name.replace(/\s+/g, '-').toLowerCase()}.pdf`
      : 'livraisons-par-chauffeur.pdf';
    doc.save(fileName);
    toast.success('PDF livraisons téléchargé');
  }

  const filteredDeliveryGroups = (() => {
    let groups = selectedDriverId === 'all'
      ? deliveriesByDriver
      : deliveriesByDriver.filter(g => g.driver_name === selectedDriverId);

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
        <h1 className="text-2xl font-bold">Listes & Documents</h1>

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
                        <TableHead>Mot de passe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drivers.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{d.full_name}</TableCell>
                          <TableCell>{d.email}</TableCell>
                          <TableCell>{d.username || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{d.plain_password || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {drivers.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Aucun chauffeur</TableCell></TableRow>
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
                        <TableHead>Mot de passe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pharmacies.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono">{p.client_code}</TableCell>
                          <TableCell>{p.profile_email || p.email || '—'}</TableCell>
                          <TableCell>{p.address || '—'}</TableCell>
                          <TableCell>{p.phone || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{p.plain_password || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {pharmacies.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucune pharmacie</TableCell></TableRow>
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
                      {deliveriesByDriver.map((group, i) => (
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
                {deliveriesByDriver.length === 0 && (
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
