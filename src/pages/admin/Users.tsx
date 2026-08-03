import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Search, Users, Loader2, Shield, Truck, Eye, EyeOff, Network, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SiteFilterSelect } from '@/components/admin/SiteFilter';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { z } from 'zod';

interface UserWithRole {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: 'super_admin' | 'admin' | 'livreur' | 'pharmacie';
  created_at: string;
  is_active: boolean;
  site_id: string | null;
}

const userSchema = z.object({
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  role: z.enum(['super_admin', 'admin', 'livreur']),
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
});

type EditableRole = 'super_admin' | 'admin' | 'livreur';

export default function UsersPage() {
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === 'super_admin';
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'livreur' as EditableRole,
    username: '',
    site_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    if (isSuperAdmin) {
      supabase.from('sites').select('id, name').order('name').then(({ data }) => {
        setSites((data || []).map((s: any) => ({ id: s.id, name: s.name })));
      });
    }
  }, [isSuperAdmin]);

  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name || '—';

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || [])
        .map((profile) => {
          const userRole = roles?.find((r) => r.user_id === profile.user_id);
          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name,
            email: profile.email,
            username: profile.username || null,
            role: (userRole?.role as 'super_admin' | 'admin' | 'livreur' | 'pharmacie') || 'livreur',
            created_at: profile.created_at,
            is_active: (profile as any).is_active ?? true,
            site_id: (profile as any).site_id ?? null,
          };
        })
        .filter(u => u.role !== 'pharmacie');

      setUsers(usersWithRoles);
    } catch (error) {
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: UserWithRole) => {
    setTogglingUserId(user.id);
    try {
      const newStatus = !user.is_active;
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newStatus } as any)
        .eq('id', user.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
      toast.success(newStatus ? 'Compte réactivé' : 'Compte désactivé');
    } catch {
      toast.error('Erreur lors de la modification du statut');
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleOpenDialog = (user?: UserWithRole) => {
    setErrors({});
    setNewPassword('');
    setShowPassword(false);
    if (user) {
      setSelectedUser(user);
      setFormData({
        full_name: user.full_name,
        email: user.email && !user.email.endsWith('@dpci.local') ? user.email : '',
        password: '',
        role: (user.role === 'super_admin' || user.role === 'admin') ? user.role : 'livreur',
        username: user.username || '',
        site_id: user.site_id || '',
      });
    } else {
      setSelectedUser(null);
      setFormData({ full_name: '', email: '', password: '', role: 'livreur', username: '', site_id: '' });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setErrors({});

    const validation = selectedUser
      ? userSchema.omit({ password: true }).safeParse(formData)
      : userSchema.safeParse(formData);

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Super admin must assign a site for admins and drivers (not for super admins)
    if (isSuperAdmin && formData.role !== 'super_admin' && !formData.site_id) {
      setErrors({ site_id: 'Veuillez sélectionner un site' });
      return;
    }

    setIsSaving(true);
    try {
      if (selectedUser) {
        const updateData: any = {
          full_name: formData.full_name.trim(),
          username: formData.username.trim() || null,
        };
        if (formData.email.trim()) {
          updateData.email = formData.email.trim();
        }
        if (isSuperAdmin && formData.role !== 'super_admin' && formData.site_id) {
          updateData.site_id = formData.site_id;
        }
        if (isSuperAdmin && formData.role === 'super_admin') {
          updateData.site_id = null;
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', selectedUser.id);

        if (profileError) throw profileError;

        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: formData.role })
          .eq('user_id', selectedUser.user_id);

        if (roleError) throw roleError;

        if (newPassword) {
          if (newPassword.length < 6) {
            toast.error('Le mot de passe doit contenir au moins 6 caractères');
            setIsSaving(false);
            return;
          }
          const { data: pwData, error: pwError } = await supabase.functions.invoke('update-password', {
            body: { user_id: selectedUser.user_id, password: newPassword },
          });
          if (pwError || pwData?.error) {
            toast.error(pwData?.error || 'Erreur lors de la mise à jour du mot de passe');
            setIsSaving(false);
            return;
          }
        }

        toast.success('Utilisateur modifié avec succès');
      } else {
        const response = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email.trim() || undefined,
            password: formData.password,
            full_name: formData.full_name.trim(),
            role: formData.role,
            username: formData.username.trim() || undefined,
            site_id: isSuperAdmin && formData.role !== 'super_admin' ? formData.site_id : undefined,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || 'Erreur lors de la création');
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }

        toast.success('Utilisateur créé avec succès');
      }

      setIsDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Save error:', error);
      if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        toast.error('Cet email est déjà utilisé');
      } else {
        toast.error(error.message || "Erreur lors de l'enregistrement");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: selectedUser.user_id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Utilisateur supprimé');
      setIsDeleteDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de la suppression');
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      // Admins (non super) ne gèrent pas les super administrateurs
      (isSuperAdmin || u.role !== 'super_admin') &&
      // Filtre par site (super admin uniquement). Les super admins n'ont pas de site.
      (siteFilter === 'all' || u.role === 'super_admin' || u.site_id === siteFilter) &&
      (u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const roleSections: { role: 'super_admin' | 'admin' | 'livreur'; label: string; icon: typeof Shield }[] = [
    ...(isSuperAdmin ? [{ role: 'super_admin' as const, label: 'Super administrateurs', icon: Crown }] : []),
    { role: 'admin', label: 'Administrateurs', icon: Shield },
    { role: 'livreur', label: 'Livreurs', icon: Truck },
  ];


  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Utilisateurs</h1>
            <p className="text-muted-foreground mt-1">
              Gérez les administrateurs et les chauffeurs
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="shadow-primary">
            <Plus className="w-4 h-4 mr-2" />
            Nouvel Utilisateur
          </Button>
        </div>

        {/* Search + filtre site */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un utilisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {isSuperAdmin && (
            <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} sites={sites} />
          )}
        </div>

        {/* Sous-onglets par rôle */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue={roleSections[0]?.role} className="w-full">
            <TabsList className="w-full sm:w-auto h-auto flex-wrap justify-start">
              {roleSections.map((section) => {
                const count = filteredUsers.filter((u) => u.role === section.role).length;
                const SectionIcon = section.icon;
                return (
                  <TabsTrigger key={section.role} value={section.role} className="gap-2">
                    <SectionIcon className="w-4 h-4" />
                    <span>{section.label}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {roleSections.map((section) => {
              const sectionUsers = filteredUsers.filter((u) => u.role === section.role);
              return (
                <TabsContent key={section.role} value={section.role}>
                  {sectionUsers.length === 0 ? (
                    <div className="bg-card rounded-xl border shadow-sm text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Aucun utilisateur dans cette catégorie</p>
                    </div>
                  ) : (
                    <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nom</TableHead>
                            <TableHead className="hidden md:table-cell">Identifiant</TableHead>
                            <TableHead className="hidden md:table-cell">Email</TableHead>
                            {isSuperAdmin && <TableHead className="hidden lg:table-cell">Site</TableHead>}
                            <TableHead>Actif</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sectionUsers.map((user) => (
                            <TableRow key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                              <TableCell className="font-medium">{user.full_name}</TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-sm text-primary">
                                {user.username || '-'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground">
                                {user.email && !user.email.endsWith('@dpci.local') ? user.email : '—'}
                              </TableCell>
                              {isSuperAdmin && (
                                <TableCell className="hidden lg:table-cell text-muted-foreground">
                                  {siteName(user.site_id)}
                                </TableCell>
                              )}
                              <TableCell>
                                <Switch
                                  checked={user.is_active}
                                  onCheckedChange={() => handleToggleActive(user)}
                                  disabled={togglingUserId === user.id}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenDialog(user)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setSelectedUser(user);
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
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedUser ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
              </DialogTitle>
              <DialogDescription>
                {selectedUser
                  ? "Modifiez les informations de l'utilisateur"
                  : 'Créez un nouveau compte utilisateur'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nom complet *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Jean Dupont"
                  className={errors.full_name ? 'border-destructive' : ''}
                />
                {errors.full_name && (
                  <p className="text-sm text-destructive">{errors.full_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (facultatif)</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="jean@exemple.com"
                  disabled={!!selectedUser}
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Nom d'utilisateur *</Label>
                <p className="text-xs text-muted-foreground">
                  Identifiant principal de connexion (avec le mot de passe)
                </p>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="jean.dupont"
                  className="font-mono"
                />
                {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
              </div>
              {!selectedUser ? (
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <PasswordInput
                    id="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className={errors.password ? 'border-destructive' : ''}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="new_password">Nouveau mot de passe</Label>
                  <p className="text-xs text-muted-foreground">
                    Laisser vide pour ne pas modifier le mot de passe
                  </p>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
              <div className="space-y-2">
                <Label htmlFor="role">Rôle *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: EditableRole) =>
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && (
                      <SelectItem value="super_admin">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4" />
                          Super administrateur
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Administrateur
                      </div>
                    </SelectItem>
                    <SelectItem value="livreur">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Livreur
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isSuperAdmin && formData.role !== 'super_admin' && (
                <div className="space-y-2">
                  <Label htmlFor="site">Site *</Label>
                  <Select
                    value={formData.site_id}
                    onValueChange={(value) => setFormData({ ...formData, site_id: value })}
                  >
                    <SelectTrigger className={errors.site_id ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Sélectionner un site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <Network className="w-4 h-4" />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.site_id && <p className="text-sm text-destructive">{errors.site_id}</p>}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedUser ? 'Enregistrer' : 'Créer'}
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
                Êtes-vous sûr de vouloir supprimer l'utilisateur "{selectedUser?.full_name}" ?
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
