import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, LayoutDashboard, Package, Building2, Users, LogOut, Truck, Route, FileText, ClipboardList, Box, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import dpciLogo from '@/assets/dpci-logo.png';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface NavItem { icon: React.ElementType; label: string; href: string; }

const adminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Tableau de bord', href: '/admin' },
  { icon: Package, label: 'Livraisons', href: '/admin/deliveries' },
  { icon: ClipboardList, label: 'Parcours', href: '/admin/parcours' },
  { icon: Route, label: 'Suivi chauffeurs', href: '/admin/tracking' },
  { icon: Building2, label: 'Pharmacies', href: '/admin/pharmacies' },
  { icon: Users, label: 'Utilisateurs', href: '/admin/users' },
  { icon: Box, label: 'Bacs', href: '/admin/bacs' },
  { icon: FileText, label: 'Listes & PDF', href: '/admin/lists' },
  { icon: Route, label: 'Axes', href: '/admin/axes' },
];
const driverNavItems: NavItem[] = [{ icon: Truck, label: 'Mes Livraisons', href: '/driver' }];
const pharmacyNavItems: NavItem[] = [{ icon: Package, label: 'Mes Livraisons', href: '/pharmacy' }];

function getNavItems(role: string | null): NavItem[] {
  if (role === 'super_admin') {
    return [{ icon: Network, label: 'Sites', href: '/admin/sites' }, ...adminNavItems];
  }
  if (role === 'admin') return adminNavItems;
  if (role === 'pharmacie') return pharmacyNavItems;
  return driverNavItems;
}

function roleLabel(role: string | null) {
  if (role === 'super_admin') return 'Super administrateur';
  if (role === 'admin') return 'Administrateur';
  if (role === 'pharmacie') return 'Pharmacie';
  return 'Livreur';
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { role, signOut, user } = useAuth();
  const navItems = getNavItems(role);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 text-sidebar-foreground flex items-center justify-between px-4 lg:hidden bg-sidebar">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-card rounded-lg flex items-center justify-center p-0.5">
            <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold">DPCI</span>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"><Menu className="w-6 h-6" /></button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-sidebar text-sidebar-foreground p-0">
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border bg-sidebar">
                <div className="w-8 h-8 bg-card rounded-lg flex items-center justify-center p-0.5">
                  <img src={dpciLogo} alt="DPCI" className="w-full h-full object-contain" />
                </div>
                <span className="font-bold">DPCI</span>
              </div>
              <nav className="flex-1 px-4 py-6 space-y-1 bg-sidebar">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all", isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50")}>
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 py-4 border-t border-sidebar-border bg-sidebar">
                <div className="px-4 py-2 mb-2">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-sidebar-foreground/60">{roleLabel(role)}</p>
                </div>
                <button onClick={() => { setOpen(false); signOut(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-destructive/20 hover:text-destructive transition-all">
                  <LogOut className="w-5 h-5" />
                  Déconnexion
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
