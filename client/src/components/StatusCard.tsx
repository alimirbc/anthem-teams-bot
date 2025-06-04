import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  status: 'success' | 'error' | 'warning' | 'info';
  loading?: boolean;
}

export function StatusCard({ title, value, icon, status, loading }: StatusCardProps) {
  const statusColors = {
    success: 'border-green-200 bg-green-50',
    error: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50',
    info: 'border-blue-200 bg-blue-50',
  };

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
  };

  const valueColors = {
    success: 'text-green-900',
    error: 'text-red-900',
    warning: 'text-yellow-900',
    info: 'text-blue-900',
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-2', statusColors[status])}>
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          <div className={cn('p-2 rounded-lg bg-white', iconColors[status])}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className={cn('text-2xl font-bold', valueColors[status])}>
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
