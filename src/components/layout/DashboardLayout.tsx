import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { ProfileBubble } from './ProfileBubble';
import { MobileNav } from './MobileNav';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'livreur' | 'pharmacie' | 'super_admin';
  /** When true, both admin and super_admin can access. */
  allowSuperAdmin?: boolean;
}

export function DashboardLayout({ children, requiredRole, allowSuperAdmin }: DashboardLayoutProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Treat super_admin as having admin access by default
  const roleMatches =
    !requiredRole ||
    role === requiredRole ||
    (requiredRole === 'admin' && role === 'super_admin') ||
    (allowSuperAdmin && (role === 'admin' || role === 'super_admin'));

  if (!roleMatches) {
    if (role === 'admin' || role === 'super_admin') return <Navigate to="/admin" replace />;
    if (role === 'livreur') return <Navigate to="/driver" replace />;
    if (role === 'pharmacie') return <Navigate to="/pharmacy" replace />;
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block"><Sidebar /></div>
      <div className="lg:hidden"><MobileNav /></div>
      <div className="hidden lg:block fixed top-4 right-6 z-[60]"><ProfileBubble /></div>
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-3 sm:p-4 lg:p-8 lg:pt-20 pb-8 max-w-full overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
