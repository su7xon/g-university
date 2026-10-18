import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './client/authContext.js';
import { Navbar } from './client/components/Navbar.js';
import { DashboardView } from './client/components/DashboardView.js';
import { WorkItemsList } from './client/components/WorkItemsList.js';
import { WorkItemDetail } from './client/components/WorkItemDetail.js';
import { CreateItemModal } from './client/components/CreateItemModal.js';
import { LoginPage } from './client/components/LoginPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function AppMain() {
  const { token, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'items'>('dashboard');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 text-xs font-mono">
        Loading Newtonite Operations Platform...
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      <main className="flex-1">
        {currentTab === 'dashboard' ? (
          <DashboardView
            onSelectItem={(item) => setSelectedItemId(item.id)}
            onOpenCreate={() => setIsCreateOpen(true)}
          />
        ) : (
          <WorkItemsList
            onSelectItem={(item) => setSelectedItemId(item.id)}
            onOpenCreate={() => setIsCreateOpen(true)}
          />
        )}
      </main>

      {/* Item Detail Drawer */}
      {selectedItemId && (
        <WorkItemDetail
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
        />
      )}

      {/* Create Item Modal */}
      {isCreateOpen && (
        <CreateItemModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={(newItem) => {
            setIsCreateOpen(false);
            setSelectedItemId(newItem.id);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppMain />
      </AuthProvider>
    </QueryClientProvider>
  );
}
