import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function roleLabel(role: string | null) {
  if (role === 'super_admin') return 'Super administrateur';
  if (role === 'admin') return 'Administrateur';
  if (role === 'pharmacie') return 'Pharmacie';
  if (role === 'livreur') return 'Livreur';
  return 'Utilisateur';
}

function initials(name: string | null, email: string | null) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function ProfileBubble() {
  const { user, role, siteName, signOut } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, username')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName((data as any)?.full_name ?? null);
        setUsername((data as any)?.username ?? null);
      });
  }, [user]);

  if (!user) return null;

  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full border bg-card/90 backdrop-blur pl-1 pr-1 sm:pr-3 py-1 shadow-md hover:shadow-lg transition-shadow max-w-[70vw]"
            aria-label="Profil"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials(fullName, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:flex flex-col items-start leading-tight min-w-0">
              <span className="text-sm font-medium truncate max-w-[160px]">
                {fullName || username || user.email}
              </span>
              <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                {roleLabel(role)}
                {role === 'super_admin' ? ' · Tous les sites' : siteName ? ` · ${siteName}` : ''}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials(fullName, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{fullName || username || 'Utilisateur'}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              <span className="text-[11px] text-primary font-medium mt-0.5">{roleLabel(role)}</span>
              <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <Building2 className="h-3 w-3 shrink-0" />
                {role === 'super_admin' ? 'Tous les sites' : siteName || 'Aucun site'}
              </span>
            </div>
          </DropdownMenuLabel>
          {username && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
                <UserIcon className="h-3.5 w-3.5" />
                <span className="truncate">{username}</span>
              </div>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut()}
            className="text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
