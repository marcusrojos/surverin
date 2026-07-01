import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building } from 'lucide-react';

export interface SiteOption {
  id: string;
  name: string;
}

/**
 * Hook exposing the list of sites and the current site filter.
 * Only super admins get a non-empty site list / active filter.
 */
export function useSiteFilter() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>('all');

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase
      .from('sites')
      .select('id, name')
      .order('name')
      .then(({ data }) => setSites((data || []).map((s: any) => ({ id: s.id, name: s.name }))));
  }, [isSuperAdmin]);

  return { isSuperAdmin, sites, siteFilter, setSiteFilter };
}

interface SiteFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  sites: SiteOption[];
  className?: string;
}

export function SiteFilterSelect({ value, onChange, sites, className }: SiteFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className || 'w-full sm:w-56'}>
        <Building className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
        <SelectValue placeholder="Tous les sites" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tous les sites</SelectItem>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
