import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'super_admin' | 'admin' | 'livreur' | 'pharmacie';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  siteId: string | null;
  siteName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    // Never trust a client-cached role — always resolve from the server.
    // On failure, force role to null so no elevated UI is shown.
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        setRole(data.role as AppRole);
      } else {
        setRole(null);
      }
    } catch {
      setRole(null);
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('site_id, sites:site_id(name)')
        .eq('user_id', userId)
        .maybeSingle();
      setSiteId((profile as any)?.site_id ?? null);
      setSiteName((profile as any)?.sites?.name ?? null);
    } catch {
      setSiteId(null);
      setSiteName(null);
    }
  };


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setSiteId(null);
          setSiteName(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) return { error };
    
    // Check if account and site are active
    if (signInData?.user) {
      const [{ data: profile }, { data: roleRow }] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_active, site_id, sites:site_id(is_active)')
          .eq('user_id', signInData.user.id)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', signInData.user.id)
          .maybeSingle(),
      ]);

      if (profile && (profile as any).is_active === false) {
        await supabase.auth.signOut();
        return { error: new Error('Votre compte a été désactivé. Contactez un administrateur.') };
      }

      // Les super admins gèrent tous les sites : ni la désactivation ni la suppression d'un site ne les bloque
      const isSuperAdmin = (roleRow as any)?.role === 'super_admin';
      const site = (profile as any)?.sites;
      if (!isSuperAdmin) {
        // Site supprimé (site_id devenu nul) => aucun accès à la plateforme
        if (!profile || !(profile as any).site_id || !site) {
          await supabase.auth.signOut();
          return { error: new Error("Votre site n'existe plus. Contactez un administrateur.") };
        }
        if (site.is_active === false) {
          await supabase.auth.signOut();
          return { error: new Error('Votre site a été désactivé. Contactez un administrateur.') };
        }
      }

    }
    
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setSiteId(null);
    setSiteName(null);

  };

  return (
    <AuthContext.Provider value={{ user, session, role, siteId, siteName, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
