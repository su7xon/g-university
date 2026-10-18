import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '../authContext.js';
import { api, WorkItem } from '../api.js';
import { X, Key, Plus } from 'lucide-react';

interface CreateItemModalProps {
  onClose: () => void;
  onCreated: (item: WorkItem) => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  onClose,
  onCreated,
}) => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const userTeams = user?.memberships || [];
  const defaultTeam = userTeams[0]?.team_id || '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('incident');
  const [priority, setPriority] = useState('high');
  const [teamId, setTeamId] = useState(defaultTeam);
  const [assigneeId, setAssigneeId] = useState('');
  const [idempotencyKey] = useState(() => 'idemp-' + crypto.randomUUID());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: usersData } = useQuery({
    queryKey: ['teamUsers'],
    queryFn: () => api.getUsers(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createItem(
        token!,
        {
          title,
          description,
          type,
          priority,
          team_id: teamId,
          assignee_id: assigneeId || null,
        },
        idempotencyKey
      ),
    onSuccess: (newItem) => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      onCreated(newItem);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to create work item');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !teamId) {
      setErrorMessage('Please fill in title, description, and team.');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleUp">
        
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-red-950 border border-red-800 flex items-center justify-center text-red-500">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Log New Work Item</h2>
              <p className="text-[11px] text-zinc-400">Strict transactional creation with idempotency</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <Key className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="truncate">
            Idempotency Key: <strong className="text-zinc-300">{idempotencyKey}</strong>
          </span>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-mono text-[11px] mb-1">TITLE *</label>
            <input
              type="text"
              required
              placeholder="e.g. Stripe webhook signature delivery mismatch [SEV-2]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 font-mono text-[11px] mb-1">DESCRIPTION *</label>
            <textarea
              required
              rows={3}
              placeholder="Provide symptoms, suspected root causes, customer impact..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">TEAM DOMAIN *</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-red-500"
              >
                {userTeams.map((m) => (
                  <option key={m.team_id} value={m.team_id}>
                    {m.team_name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">TYPE *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-red-500"
              >
                <option value="incident">Incident</option>
                <option value="customer_issue">Customer Issue</option>
                <option value="payment">Payment & Settlement</option>
                <option value="compliance">Compliance</option>
                <option value="task">Operational Task</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">PRIORITY *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-red-500"
              >
                <option value="urgent">Urgent (Immediate Pager)</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-mono text-[11px] mb-1">INITIAL ASSIGNEE</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-red-500"
              >
                <option value="">Leave Unassigned</option>
                <option value={user?.id}>Assign to Myself</option>
                {usersData?.users
                  ?.filter((u) => u.id !== user?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition flex items-center gap-1.5 shadow"
            >
              {createMutation.isPending ? 'Writing to Ledger...' : 'Commit Work Item'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
