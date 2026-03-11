import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import dpciLogo from '@/assets/dpci-logo.png';
import { supabase } from '@/integrations/supabase/client';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const { signIn, user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && role) {
    return <Navigate to={role === 'admin' ? '/admin' : role === 'pharmacie' ? '/pharmacy' : '/driver'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!identifier.trim()) {
      setErrors({ identifier: 'Identifiant requis' });
      return;
    }
    if (!password) {
      setErrors({ password: 'Mot de passe requis' });
      return;
    }

    setIsLoading(true);
    
    try {
      let email = identifier.trim();
      
      // If it doesn't look like an email, resolve the identifier
      if (!email.includes('@')) {
        const { data, error } = await supabase.rpc('resolve_identifier_to_email', { identifier: email });
        
        if (error || !data) {
          toast.error('Identifiant introuvable');
          setIsLoading(false);
          return;
        }
        email = data;
      }
      
      const { error } = await signIn(email, password);
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Identifiants incorrects. Veuillez réessayer.');
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Veuillez confirmer votre email avant de vous connecter.');
        } else {
          toast.error('Une erreur est survenue. Veuillez réessayer.');
        }
      }
    } catch {
      toast.error('Une erreur est survenue. Veuillez réessayer.');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-secondary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTItMi0yLTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="mb-8">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center p-2 mb-6 shadow-2xl">
              <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white mb-4">
              DPCI
            </h1>
            <p className="text-xl text-white/90 mb-2">
              Livraison Express Pharmaceutique
            </p>
            <p className="text-white/70 max-w-md">
              Plateforme de gestion des livraisons de colis vers les pharmacies. 
              Suivi en temps réel et validation simplifiée.
            </p>
          </div>

          <div className="flex items-center gap-4 text-white/80">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <p className="font-medium text-white">Livraisons Sécurisées</p>
              <p className="text-sm text-white/70">Traçabilité complète</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center p-2 mb-4 shadow-lg">
              <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">DPCI</h1>
            <p className="text-muted-foreground text-sm">Livraison Express</p>
          </div>

          <Card className="border-0 shadow-xl bg-card">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold">Connexion</CardTitle>
              <CardDescription>
                Entrez vos identifiants pour accéder à votre espace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Identifiant</Label>
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="Email, nom d'utilisateur ou code client"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isLoading}
                    className={errors.identifier ? 'border-destructive' : ''}
                  />
                  {errors.identifier && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.identifier}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={errors.password ? 'border-destructive' : ''}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.password}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-medium shadow-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connexion...
                    </>
                  ) : (
                    'Se connecter'
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground text-center">
                  Les comptes sont créés par l'administrateur.
                  <br />
                  Contactez votre responsable si besoin.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
