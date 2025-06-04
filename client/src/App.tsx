import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";

function PublicHome() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-lg">
        <div className="w-24 h-16 flex items-center justify-center mx-auto mb-6">
          <svg width="120" height="40" viewBox="0 0 120 40" className="w-full h-full">
            <text x="2" y="28" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="bold" fill="currentColor">Anthem</text>
            <path d="M98 8 L110 20 L98 32 L102 28 L108 22 L102 16 Z" fill="currentColor"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Anthem Helpdesk Assistant</h1>
        <p className="text-gray-600 mb-6">
          Get instant Helpdesk support through Microsoft Teams. Our AI-powered bot provides 24/7 assistance with technical issues and access to our knowledge base.
        </p>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">To get started:</p>
          <p className="text-sm text-gray-700">Open Microsoft Teams and search for "Anthem Helpdesk Assistant"</p>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PublicHome} />
      <Route path="/admin/dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
