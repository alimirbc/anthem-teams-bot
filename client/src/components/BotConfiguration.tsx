import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Key,
  Shield,
  Bot,
  Database
} from "lucide-react";

interface BotConfig {
  teams_bot_configured: boolean;
  openai_configured: boolean;
  atera_api_configured: boolean;
  database_configured: boolean;
  knowledge_base_articles: number;
}

interface BotConfigurationProps {
  config?: BotConfig;
  loading?: boolean;
}

export function BotConfiguration({ config, loading }: BotConfigurationProps) {

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="h-5 w-5" />
            <span>IT Support Bot Status</span>
          </CardTitle>
          <CardDescription>Current system availability and knowledge base</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Bot Service</span>
            </div>
            <Badge variant={config?.teams_bot_configured && config?.openai_configured ? "default" : "destructive"}>
              {config?.teams_bot_configured && config?.openai_configured ? 'Online' : 'Offline'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Knowledge Base Articles</span>
            </div>
            <Badge variant="default">
              {config?.knowledge_base_articles || 0} articles
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Service Status */}
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>Current availability of IT support services</CardDescription>
        </CardHeader>
        <CardContent>
          {config?.teams_bot_configured && config?.openai_configured && config?.atera_api_configured && config?.database_configured ? (
            <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium text-green-900">All systems operational</p>
                <p className="text-sm text-green-700">IT Support Bot is ready to assist with {config?.knowledge_base_articles || 0} knowledge base articles</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-900">Limited functionality</p>
                <p className="text-sm text-yellow-700">Some features may be unavailable while maintenance is in progress</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Knowledge base and system details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{config?.knowledge_base_articles || 0}</p>
              <p className="text-sm text-blue-800">Articles Available</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {(config?.teams_bot_configured && config?.openai_configured && config?.atera_api_configured && config?.database_configured) ? '100%' : '75%'}
              </p>
              <p className="text-sm text-green-800">System Ready</p>
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}
