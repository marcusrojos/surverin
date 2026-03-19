import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Building2, Users, LogOut, Truck, Route, FileText, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import dpciLogo from '@/assets/dpci-logo.png';

interface NavItem { icon: React.ElementType; label: string; href: string; }

const adminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Tableau de bord', href: '/admin' },
  { icon: Package, label: 'Livraisons', href: '/admin/deliveries' },
  { icon: ClipboardList, label: 'Parcours', href: '/admin/parcours' },
  { icon: Route, label: 'Suivi chauffeurs', href: '/admin/tracking' },
  { icon: Building2, label: 'Pharmacies', href: '/admin/pharmacies' },
  { icon: Users, label: 'Utilisateurs', href: '/admin/users' },
  { icon: FileText, label: 'Listes & PDF', href: '/admin/lists' },
  { icon: Route, label: 'Axes', href: '/admin/axes' },
];
const driverNavItems: NavItem[] = [{ icon: Truck, label: 'Mes Livraisons', href: '/driver' }];
const pharmacyNavItems: NavItem[] = [{ icon: Package, label: 'Mes Livraisons', href: '/pharmacy' }];

export function Sidebar() {
  const location = useLocation();
  const { role, signOut, user } = useAuth();
  const navItems = role === 'admin' ? adminNavItems : role === 'pharmacie' ? pharmacyNavItems : driverNavItems;

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="w-10 h-10 bg-card rounded-lg flex items-center justify-center p-1">
          <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">DPCI</h1>
          <p className="text-xs text-sidebar-foreground/70">Livraison Express</p>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href || (item.href !== '/admin' && item.href !== '/driver' && location.pathname.startsWith(item.href));
          return (
            <Link key={item.href} to={item.href} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200", isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground")}>
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium truncate">{user?.email}</p>
          <p className="text-xs text-sidebar-foreground/60 capitalize">{role === 'admin' ? 'Administrateur' : role === 'pharmacie' ? 'Pharmacie' : 'Livreur'}</p>
        </div>
        <button onClick={signOut} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-destructive/20 hover:text-destructive transition-all duration-200">
          <LogOut className="w-5 h-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
