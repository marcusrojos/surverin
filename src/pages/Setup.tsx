import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import dpciLogo from '@/assets/dpci-logo.webp';

export default function Setup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    setLoading(true);

    try {
      // Check if admin already exists
      const { data: existingRoles } = await supabase
        .from('user_roles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (existingRoles && existingRoles.length > 0) {
        toast.error('Un administrateur existe déjà');
        navigate('/login');
        return;
      }

      // Create admin user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });

      if (signUpError || !signUpData.user) {
        toast.error(signUpError?.message || 'Erreur lors de la création');
        setLoading(false);
        return;
      }

      const userId = signUpData.user.id;

      // Create profile
      await supabase.from('profiles').insert({
        user_id: userId,
        email: email.trim(),
        full_name: fullName.trim(),
        plain_password: password.trim(),
      });

      // Create admin role
      await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'admin',
      });

      toast.success('Compte administrateur créé avec succès !');
      navigate('/login');
    } catch {
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center p-2">
            <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Configuration initiale
            </CardTitle>
            <CardDescription>Créez le premier compte administrateur</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jean Dupont" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@dpci.com" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Créer le compte admin
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
