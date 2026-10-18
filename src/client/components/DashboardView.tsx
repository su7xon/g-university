import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../authContext.js';
import { api, WorkItem } from '../api.js';
import {
  UserCheck,
  Clock,
  Flame,
  Check,
  ShieldAlert,
} from 'lucide-react';

interface DashboardViewProps {
  onSelectItem: (item: WorkItem) => void;
  onOpenCreate: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectItem,
  onOpenCreate,
}) => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardStats', user?.id],
    queryFn: () => api.getDashboardStats(token!),
    enabled: !!token && !!user,
    refetchInterval: 5000,
  });

  const claimMutation = useMutation({
    mutationFn: (itemId: string) => api.claimItem(token!, itemId),
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      onSelectItem(updatedItem);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to claim item. It may have already been claimed.');
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ itemId, version }: { itemId: string; version: number }) =>
      api.transitionItem(token!, itemId, { toStatus: 'Resolved', version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to approve item');
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-red-950/80 text-red-400 border border-red-800 animate-pulse">
            <Flame className="w-3 h-3" /> URGENT
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
            HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-950/60 text-blue-400 border border-blue-900">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; border: string }> = {
      Open: { bg: 'bg-zinc-800', text: 'text-zinc-200', border: 'border-zinc-700' },
      InProgress: { bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-800' },
      AwaitingApproval: { bg: 'bg-amber-950', text: 'text-amber-300', border: 'border-amber-800' },
      Resolved: { bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-800' },
      Closed: { bg: 'bg-zinc-900', text: 'text-zinc-500', border: 'border-zinc-800' },
    };
    const s = map[status] || map.Open;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${s.bg} ${s.text} ${s.border}`}>
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="h-96 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
          <div className="h-96 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
          <div className="h-96 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
          Failed to load dashboard metrics. Check server status.
        </div>
      </div>
    );
  }

  const assignedToMe = data?.assignedToMe || [];
  const unassignedUrgent = data?.unassignedUrgent || [];
  const awaitingApproval = data?.awaitingApproval || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            Active Incident Command & Triage
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time scoped queue for <span className="text-zinc-200 font-medium">{user?.name}</span> across {user?.memberships.length} team(s).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.memberships.map((m) => (
            <span
              key={m.team_id}
              className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {m.team_name}: <strong className="text-white">{m.role}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. ASSIGNED TO ME */}
        <div className="flex flex-col bg-zinc-900/40 rounded-xl border border-zinc-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Assigned to Me</h2>
                <p className="text-[11px] text-zinc-400">Active items under your ownership</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
              {assignedToMe.length}
            </span>
          </div>

          <div className="p-3 divide-y divide-zinc-800/60 overflow-y-auto max-h-[560px] flex-1">
            {assignedToMe.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                No active work items assigned to you.
              </div>
            ) : (
              assignedToMe.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="p-3 hover:bg-zinc-800/50 rounded-lg transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-zinc-400">
                      v{item.version} • {item.team_name}
                    </span>
                    {getPriorityBadge(item.priority)}
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition line-clamp-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-zinc-800/40">
                    {getStatusBadge(item.status)}
                    <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. UNASSIGNED URGENT */}
        <div className="flex flex-col bg-zinc-900/40 rounded-xl border border-red-950/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800/80 bg-red-950/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-red-950 border border-red-800 flex items-center justify-center text-red-400">
                <Flame className="w-4 h-4 text-red-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Unassigned Urgent</h2>
                <p className="text-[11px] text-zinc-400">Critical incidents needing immediate claiming</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800 font-bold">
              {unassignedUrgent.length}
            </span>
          </div>

          <div className="p-3 divide-y divide-zinc-800/60 overflow-y-auto max-h-[560px] flex-1">
            {unassignedUrgent.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                All high-priority incidents currently claimed.
              </div>
            ) : (
              unassignedUrgent.map((item) => (
                <div
                  key={item.id}
                  className="p-3 hover:bg-zinc-800/50 rounded-lg transition group relative"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-zinc-400">
                      v{item.version} • {item.team_name}
                    </span>
                    {getPriorityBadge(item.priority)}
                  </div>
                  <h3
                    onClick={() => onSelectItem(item)}
                    className="text-xs font-semibold text-zinc-200 group-hover:text-red-400 transition cursor-pointer line-clamp-2"
                  >
                    {item.title}
                  </h3>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/40">
                    <span className="text-[10px] text-red-400/90 font-mono">
                      Unassigned
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        claimMutation.mutate(item.id);
                      }}
                      disabled={claimMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600 hover:bg-red-500 text-white transition flex items-center gap-1 shadow-sm"
                    >
                      <UserCheck className="w-3 h-3" />
                      Claim Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. AWAITING MY APPROVAL */}
        <div className="flex flex-col bg-zinc-900/40 rounded-xl border border-zinc-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Awaiting My Approval</h2>
                <p className="text-[11px] text-zinc-400">Gatekeeping for Team Leads & Admins</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
              {awaitingApproval.length}
            </span>
          </div>

          <div className="p-3 divide-y divide-zinc-800/60 overflow-y-auto max-h-[560px] flex-1">
            {awaitingApproval.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                {user?.memberships.some((m) => m.role === 'Lead' || m.role === 'Admin')
                  ? 'No items currently awaiting your approval.'
                  : 'Approval queue visible only to Team Leads and Admins.'}
              </div>
            ) : (
              awaitingApproval.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="p-3 hover:bg-zinc-800/50 rounded-lg transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-zinc-400">
                      v{item.version} • {item.team_name}
                    </span>
                    {getPriorityBadge(item.priority)}
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-200 group-hover:text-amber-400 transition line-clamp-2">
                    {item.title}
                  </h3>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/40">
                    <span className="text-[10px] text-zinc-400 font-mono">
                      By: {item.assignee_name || 'Unassigned'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        approveMutation.mutate({ itemId: item.id, version: item.version });
                      }}
                      disabled={approveMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1 shadow-sm"
                    >
                      <Check className="w-3 h-3" />
                      Approve & Resolve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
