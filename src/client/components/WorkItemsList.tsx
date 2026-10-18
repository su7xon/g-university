import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../authContext.js';
import { api, WorkItem } from '../api.js';
import {
  Search,
  Flame,
  User,
  Calendar,
  Layers,
  RotateCcw,
} from 'lucide-react';

interface WorkItemsListProps {
  onSelectItem: (item: WorkItem) => void;
  onOpenCreate: () => void;
}

export const WorkItemsList: React.FC<WorkItemsListProps> = ({
  onSelectItem,
}) => {
  const { token, user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCursor(null);
      setCursorHistory([]);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data: teamsData } = useQuery({
    queryKey: ['teams', user?.id],
    queryFn: () => api.getTeams(token!),
    enabled: !!token,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'workItems',
      selectedTeam,
      selectedStatus,
      selectedPriority,
      selectedAssignee,
      debouncedSearch,
      cursor,
    ],
    queryFn: () =>
      api.getItems(token!, {
        team: selectedTeam || undefined,
        status: selectedStatus || undefined,
        priority: selectedPriority || undefined,
        assignee: selectedAssignee || undefined,
        q: debouncedSearch || undefined,
        cursor: cursor || undefined,
        limit: 20,
      }),
    enabled: !!token,
  });

  const items = data?.items || [];
  const nextCursor = data?.nextCursor;

  const handleNextPage = () => {
    if (nextCursor) {
      setCursorHistory((prev) => [...prev, cursor || '']);
      setCursor(nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(prevCursor || null);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedTeam('');
    setSelectedStatus('');
    setSelectedPriority('');
    setSelectedAssignee('');
    setCursor(null);
    setCursorHistory([]);
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-red-950/80 text-red-400 border border-red-800">
            <Flame className="w-3 h-3 text-red-500 animate-pulse" /> URGENT
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      <div className="bg-zinc-900/40 rounded-xl border border-zinc-800 p-4 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Full-text search by title or description (e.g. database, stripe, webhook)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-600 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/60">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">TEAM SCOPE</label>
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value);
                setCursor(null);
                setCursorHistory([]);
              }}
              className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-red-600"
            >
              <option value="">All My Teams ({teamsData?.teams?.length || 0})</option>
              {teamsData?.teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">STATUS</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCursor(null);
                setCursorHistory([]);
              }}
              className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-red-600"
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="AwaitingApproval">Awaiting Approval</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">PRIORITY</label>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value);
                setCursor(null);
                setCursorHistory([]);
              }}
              className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-red-600"
            >
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">ASSIGNEE</label>
            <select
              value={selectedAssignee}
              onChange={(e) => {
                setSelectedAssignee(e.target.value);
                setCursor(null);
                setCursorHistory([]);
              }}
              className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-red-600"
            >
              <option value="">All Assignees</option>
              <option value={user?.id}>Assigned to Me</option>
              <option value="unassigned">Unassigned Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/40 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
        
        <div className="px-4 py-3 bg-zinc-950/60 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>OPERATIONAL STREAM</span>
            {isFetching && <span className="text-zinc-500 animate-pulse">• Syncing...</span>}
          </div>
          <div>
            Page {cursorHistory.length + 1} • {items.length} records shown
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-zinc-400 text-xs animate-pulse">
            Querying high-throughput operational records...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-xs">
            No work items match the selected filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectItem(item)}
                className="p-4 hover:bg-zinc-800/40 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      v{item.version}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {item.team_name}
                    </span>
                    {getPriorityBadge(item.priority)}
                    {getStatusBadge(item.status)}
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">
                      [{item.type}]
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 group-hover:text-red-400 transition truncate">
                    {item.title}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-1">
                    {item.description}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center text-right shrink-0 gap-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/50">
                  <div className="text-xs text-zinc-300 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    {item.assignee_name ? (
                      <span>{item.assignee_name}</span>
                    ) : (
                      <span className="text-amber-400 font-mono text-[11px]">Unassigned</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-4 bg-zinc-950/60 border-t border-zinc-800 flex items-center justify-between text-xs">
          <button
            onClick={handlePrevPage}
            disabled={cursorHistory.length === 0 || isFetching}
            className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition"
          >
            ← Previous Page
          </button>

          <span className="text-zinc-500 text-[11px] font-mono">
            Cursor Pagination Mode (Index-Backed)
          </span>

          <button
            onClick={handleNextPage}
            disabled={!nextCursor || isFetching}
            className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition"
          >
            Next Page →
          </button>
        </div>

      </div>

    </div>
  );
};
