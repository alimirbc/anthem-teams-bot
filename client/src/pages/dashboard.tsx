import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusCard } from "@/components/StatusCard";
import { BotConfiguration } from "@/components/BotConfiguration";
import { 
  Bot, 
  Activity, 
  Settings, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Users,
  MessageSquare,
  Database,
  Shield
} from "lucide-react";

interface HealthStatus {
  status: string;
  timestamp: string;
  services: {
    teams_bot: boolean;
    database: boolean;
    atera_api: boolean;
    openai: boolean;
  };
}

interface BotConfig {
  teams_bot_configured: boolean;
  openai_configured: boolean;
  atera_api_configured: boolean;
  database_configured: boolean;
  knowledge_base_articles: number;
}

interface Analytics {
  total_interactions: number;
  avg_response_time: number;
  recent_queries: Array<{
    query: string;
    timestamp: string;
    response_time: number;
  }>;
}

export default function Dashboard() {
  const { data: health, isLoading: healthLoading } = useQuery<HealthStatus>({
    queryKey: ['/api/health'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: config, isLoading: configLoading } = useQuery<BotConfig>({
    queryKey: ['/api/bot/config'],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ['/api/analytics/interactions'],
    refetchInterval: 60000, // Refresh every minute
  });

  const isConfigured = config?.teams_bot_configured && config?.openai_configured && config?.atera_api_configured && config?.database_configured;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">IT Support Bot Dashboard</h1>
                <p className="text-sm text-gray-500">Microsoft Teams Integration</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {health?.status === 'healthy' ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Online
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Offline
                </Badge>
              )}
              <span className="text-sm text-gray-500">
                Last updated: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Configuration Alert */}
        {!isConfigured && !configLoading && (
          <Alert className="mb-6 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              Bot configuration is incomplete. Please check your environment variables for Teams bot, OpenAI, Atera API, and database settings.
            </AlertDescription>
          </Alert>
        )}

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatusCard
            title="Bot Status"
            value={health?.status === 'healthy' ? 'Online' : 'Offline'}
            icon={<Bot className="h-5 w-5" />}
            status={health?.status === 'healthy' ? 'success' : 'error'}
            loading={healthLoading}
          />

          <StatusCard
            title="Total Interactions"
            value={analytics?.total_interactions?.toString() || '0'}
            icon={<MessageSquare className="h-5 w-5" />}
            status="info"
            loading={analyticsLoading}
          />

          <StatusCard
            title="Avg Response Time"
            value={analytics?.avg_response_time ? `${Math.round(analytics.avg_response_time)}ms` : '0ms'}
            icon={<Clock className="h-5 w-5" />}
            status="info"
            loading={analyticsLoading}
          />

          <StatusCard
            title="Services Status"
            value={`${Object.values(health?.services || {}).filter(Boolean).length}/4`}
            icon={<Shield className="h-5 w-5" />}
            status={Object.values(health?.services || {}).every(Boolean) ? 'success' : 'warning'}
            loading={healthLoading}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Service Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <span>Service Status</span>
                  </CardTitle>
                  <CardDescription>Current status of all bot services</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Teams Bot</span>
                    <Badge variant={health?.services.teams_bot ? "default" : "destructive"}>
                      {health?.services.teams_bot ? 'Configured' : 'Missing Credentials'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Database</span>
                    <Badge variant={health?.services.database ? "default" : "destructive"}>
                      {health?.services.database ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Atera API</span>
                    <Badge variant={health?.services.atera_api ? "default" : "destructive"}>
                      {health?.services.atera_api ? 'Connected' : 'Missing Token'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">OpenAI Integration</span>
                    <Badge variant={health?.services.openai ? "default" : "destructive"}>
                      {health?.services.openai ? 'Configured' : 'Missing API Key'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="h-5 w-5" />
                    <span>Recent Activity</span>
                  </CardTitle>
                  <CardDescription>Latest user interactions</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : analytics?.recent_queries.length ? (
                    <div className="space-y-3">
                      {analytics.recent_queries.slice(0, 5).map((query, index) => (
                        <div key={index} className="border-l-4 border-blue-200 pl-3">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {query.query}
                          </p>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span>{new Date(query.timestamp).toLocaleString()}</span>
                            <span>•</span>
                            <span>{query.response_time}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No recent interactions</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Interaction History</CardTitle>
                  <CardDescription>Recent user queries and response times</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="animate-pulse">
                          <div className="h-5 bg-gray-200 rounded w-full mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                        </div>
                      ))}
                    </div>
                  ) : analytics?.recent_queries.length ? (
                    <div className="space-y-4">
                      {analytics.recent_queries.map((query, index) => (
                        <div key={index} className="p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{query.query}</p>
                              <p className="text-sm text-gray-500 mt-1">
                                {new Date(query.timestamp).toLocaleString()}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {query.response_time}ms
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No interaction data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>Bot performance statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Queries</span>
                    <span className="text-lg font-bold text-blue-600">
                      {analytics?.total_interactions || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Avg Response</span>
                    <span className="text-lg font-bold text-green-600">
                      {analytics?.avg_response_time ? `${Math.round(analytics.avg_response_time)}ms` : '0ms'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Success Rate</span>
                    <span className="text-lg font-bold text-emerald-600">98.5%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="configuration">
            <BotConfiguration config={config} loading={configLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
