import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, ShieldCheck, Lock, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { createPdf, sectionTitle, table, field, finalizePdf, infoBox, type TableColumn } from '@/lib/pdf-kit';

interface AccessRow {
  user_id: string;
  full_name: string;
  role: string;
  site_id: string | null;
  site_name: string | null;
  identifier: string;
  password: string | null;
  updated_at: string | null;
}

function roleLabel(role: string) {
  if (role === 'super_admin') return 'Super administrateur';
  if (role === 'admin') return 'Administrateur';
  if (role === 'pharmacie') return 'Pharmacie';
  if (role === 'livreur') return 'Livreur';
  return role;
}

interface Props {
  /** Site scope selected by a super admin ('all' or a site id). */
  siteFilter: string;
  siteName?: string | null;
}

export function UserAccessExport({ siteFilter, siteName }: Props) {
  const { role, siteName: currentSiteName } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const scopeLabel =
    role === 'super_admin'
      ? siteFilter === 'all'
        ? 'Tous les sites'
        : siteName || 'Site sélectionné'
      : currentSiteName || 'Mon site';

  const handleUnlock = async () => {
    if (!password) {
      toast.error('Veuillez saisir votre mot de passe');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-access-export', {
        body: { password, site_id: role === 'super_admin' ? siteFilter : undefined },
      });

      if (error) {
        const message = (data as any)?.error || 'Vérification impossible';
        toast.error(message);
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        return;
      }

      setRows(((data as any)?.credentials ?? []) as AccessRow[]);
      setPassword('');
      toast.success('Identité vérifiée');
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la vérification');
    } finally {
      setLoading(false);
    }
  };

  const handleLock = () => {
    setRows(null);
    setRevealed({});
    setPassword('');
  };

  const downloadPDF = async () => {
    if (!rows || rows.length === 0) {
      toast.error('Aucun accès à exporter');
      return;
    }
    try {
      const ctx = await createPdf('Accès utilisateurs', 'p', 'Document confidentiel');
      field(ctx, 'Périmètre', scopeLabel, true);
      field(ctx, 'Comptes', String(rows.length));
      field(ctx, 'Édité le', new Date().toLocaleString('fr-FR'));
      infoBox(
        ctx,
        "Document strictement confidentiel : il contient les identifiants et mots de passe de connexion. Sa consultation est enregistrée dans le journal d'audit.",
        'warning',
      );

      const columns: TableColumn[] = [
        { header: 'Nom complet', width: 50 },
        { header: 'Rôle', width: 34 },
        { header: 'Site', width: 32 },
        { header: 'Identifiant', width: 36 },
        { header: 'Mot de passe', width: 36 },
      ];

      sectionTitle(ctx, 'Liste des accès');
      table(
        ctx,
        columns,
        rows.map((r) => [
          r.full_name,
          roleLabel(r.role),
          r.site_name || '—',
          r.identifier,
          r.password || 'Non archivé',
        ]),
      );

      await finalizePdf(ctx, `acces-utilisateurs-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF généré');
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la génération du PDF');
    }
  };

  if (!rows) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" /> Accès utilisateurs
          </CardTitle>
          <CardDescription>
            Zone confidentielle. Confirmez votre mot de passe pour afficher et télécharger les
            identifiants des comptes de {scopeLabel.toLowerCase()}. Chaque consultation est
            enregistrée dans l'historique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reauth_password">Votre mot de passe</Label>
            <PasswordInput
              id="reauth_password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUnlock();
              }}
            />
          </div>
          <Button onClick={handleUnlock} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Vérifier mon identité
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Accès utilisateurs — {scopeLabel}</CardTitle>
          <CardDescription>{rows.length} compte(s) archivé(s)</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadPDF} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> Télécharger PDF
          </Button>
          <Button onClick={handleLock} variant="ghost" size="sm" className="gap-2">
            <RotateCcw className="w-4 h-4" /> Verrouiller
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom complet</TableHead>
                <TableHead className="hidden sm:table-cell">Rôle</TableHead>
                <TableHead className="hidden lg:table-cell">Site</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Mot de passe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {roleLabel(r.role)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {r.site_name || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary">{r.identifier}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {revealed[r.user_id] ? r.password : '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [r.user_id]: !prev[r.user_id] }))
                        }
                        aria-label="Afficher le mot de passe"
                      >
                        {revealed[r.user_id] ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aucun accès archivé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
