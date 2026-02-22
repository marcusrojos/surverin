import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'livreur' | 'pharmacie';
}

export function DashboardLayout({ children, requiredRole }: DashboardLayoutProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && role !== requiredRole) {
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'livreur') return <Navigate to="/driver" replace />;
    if (role === 'pharmacie') return <Navigate to="/pharmacy" replace />;
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block"><Sidebar /></div>
      <div className="lg:hidden"><MobileNav /></div>
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-3 sm:p-4 lg:p-8 pb-8">{children}</div>
      </main>
    </div>
  );
}
