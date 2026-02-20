import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: 'en_attente' | 'livre';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
        status === 'en_attente' && "status-pending",
        status === 'livre' && "status-delivered",
        className
      )}
    >
      {status === 'en_attente' ? 'En attente' : 'Livré'}
    </span>
  );
}
