import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../authContext.js';
import { api, WorkItem, ActivityEvent, Comment } from '../api.js';
import {
  X,
  UserCheck,
  Edit3,
  Check,
  AlertTriangle,
  ArrowRight,
  Send,
  MessageSquare,
  History,
  RotateCcw,
} from 'lucide-react';

interface WorkItemDetailProps {
  itemId: string;
  onClose: () => void;
}

export const WorkItemDetail: React.FC<WorkItemDetailProps> = ({
  itemId,
  onClose,
}) => {
  const { token, getUserRoleInTeam } = useAuth();
  const queryClient = useQueryClient();

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [commentText, setCommentText] = useState('');

  const {
    data: item,
    isLoading: isLoadingItem,
    error: itemError,
    refetch: refetchItem,
  } = useQuery({
    queryKey: ['itemDetail', itemId],
    queryFn: async () => {
      const data = await api.getItemById(token!, itemId);
      setEditTitle(data.title);
      setEditDescription(data.description);
      setEditPriority(data.priority);
      return data;
    },
    enabled: !!token && !!itemId,
  });

  const { data: activityData, refetch: refetchActivity } = useQuery({
    queryKey: ['itemActivity', itemId],
    queryFn: () => api.getActivity(token!, itemId),
    enabled: !!token && !!itemId,
  });

  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['itemComments', itemId],
    queryFn: () => api.getComments(token!, itemId),
    enabled: !!token && !!itemId,
  });

  const userRole = item ? getUserRoleInTeam(item.team_id) : null;
  const isViewer = userRole === 'Viewer';
  const isLeadOrAdmin = userRole === 'Lead' || userRole === 'Admin';

  const claimMutation = useMutation({
    mutationFn: () => api.claimItem(token!, itemId),
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.setQueryData(['itemDetail', itemId], updated);
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      refetchActivity();
    },
    onError: (err: any) => {
      if (err.status === 409) {
        setConflictError('Conflict: This item was already claimed by another operator. Reloading...');
      } else {
        setConflictError(err.message || 'Claim failed');
      }
      refetchItem();
      refetchActivity();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { version: number; title: string; description: string; priority: string }) =>
      api.updateItem(token!, itemId, payload),
    onMutate: async (newValues) => {
      await queryClient.cancelQueries({ queryKey: ['itemDetail', itemId] });
      const previousItem = queryClient.getQueryData<WorkItem>(['itemDetail', itemId]);
      if (previousItem) {
        queryClient.setQueryData(['itemDetail', itemId], {
          ...previousItem,
          ...newValues,
        });
      }
      return { previousItem };
    },
    onSuccess: (updated) => {
      setConflictError(null);
      setIsEditing(false);
      queryClient.setQueryData(['itemDetail', itemId], updated);
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      refetchActivity();
    },
    onError: (err: any, _newValues, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData(['itemDetail', itemId], context.previousItem);
      }
      if (err.status === 409) {
        setConflictError('This item changed, please reload. (Optimistic lock conflict: another operator modified this item concurrently).');
      } else {
        setConflictError(err.message || 'Update failed');
      }
      refetchItem();
      refetchActivity();
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({ toStatus, version }: { toStatus: string; version: number }) =>
      api.transitionItem(token!, itemId, { toStatus, version }),
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.setQueryData(['itemDetail', itemId], updated);
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      refetchActivity();
    },
    onError: (err: any) => {
      if (err.status === 409) {
        setConflictError('This item changed, please reload. Version conflict during transition.');
      } else {
        setConflictError(err.message || 'State transition rejected');
      }
      refetchItem();
      refetchActivity();
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => api.addComment(token!, itemId, body),
    onSuccess: () => {
      setCommentText('');
      refetchComments();
      refetchActivity();
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to submit comment');
    },
  });

  if (isLoadingItem) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-lg w-full text-center text-zinc-400 animate-pulse text-xs">
          Loading item telemetry and history...
        </div>
      </div>
    );
  }

  if (itemError || !item) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5" /> Work Item Inaccessible
          </div>
          <p className="text-xs text-zinc-400">
            Resource-level authorization check: You do not belong to the team owning this record or it was deleted.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const transitionButtons: Array<{ label: string; toStatus: string; requiresLead?: boolean }> = [];
  if (item.status === 'Open') {
    transitionButtons.push({ label: 'Start Work', toStatus: 'InProgress' });
  } else if (item.status === 'InProgress') {
    transitionButtons.push({ label: 'Request Approval', toStatus: 'AwaitingApproval' });
    transitionButtons.push({ label: 'Direct Resolve', toStatus: 'Resolved' });
  } else if (item.status === 'AwaitingApproval') {
    transitionButtons.push({
      label: 'Approve & Resolve',
      toStatus: 'Resolved',
      requiresLead: true,
    });
    transitionButtons.push({ label: 'Send Back to In Progress', toStatus: 'InProgress' });
  } else if (item.status === 'Resolved') {
    transitionButtons.push({ label: 'Close Item', toStatus: 'Closed' });
    transitionButtons.push({ label: 'Reopen to In Progress', toStatus: 'InProgress' });
  } else if (item.status === 'Closed') {
    transitionButtons.push({ label: 'Reopen', toStatus: 'Open' });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm overflow-hidden animate-fadeIn">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl overflow-y-auto">
        
        <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              v{item.version}
            </span>
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              {item.team_name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetchItem();
                refetchActivity();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
              title="Sync Latest"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {conflictError && (
          <div className="m-4 p-3 rounded-lg bg-amber-950/90 border border-amber-600/80 text-amber-200 flex items-start justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>Concurrency Alert:</strong> {conflictError}
              </div>
            </div>
            <button
              onClick={() => {
                setConflictError(null);
                refetchItem();
              }}
              className="px-2 py-1 bg-amber-800 hover:bg-amber-700 text-white rounded text-[11px] font-semibold shrink-0"
            >
              Reload Latest
            </button>
          </div>
        )}

        <div className="p-6 space-y-6 flex-1">
          
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider font-bold bg-zinc-800 text-zinc-200 border border-zinc-700">
                {item.status}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                item.priority === 'urgent'
                  ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}>
                {item.priority}
              </span>
              <span className="text-[11px] font-mono text-zinc-500 uppercase">
                [{item.type}]
              </span>
              <span className="ml-auto text-[11px] font-mono text-zinc-500">
                Created: {new Date(item.created_at).toLocaleString()}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-semibold focus:outline-none focus:border-red-500"
                />
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-red-500"
                />
                <div className="flex items-center gap-3">
                  <label className="text-xs font-mono text-zinc-400">Priority:</label>
                  <select
                    value={editPriority}
                    onChange={(e: any) => setEditPriority(e.target.value)}
                    className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        updateMutation.mutate({
                          version: item.version,
                          title: editTitle,
                          description: editDescription,
                          priority: editPriority,
                        })
                      }
                      disabled={updateMutation.isPending}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
                    >
                      <Check className="w-3.5 h-3.5" /> Save (v{item.version})
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-lg font-bold text-zinc-100 leading-snug">
                  {item.title}
                </h1>
                <p className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80">
                  {item.description}
                </p>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>WORKFLOW STATE MACHINE</span>
              <span className="text-zinc-300 font-bold">Current: {item.status}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!item.assignee_id && !isViewer && (
                <button
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 shadow"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Claim Ownership
                </button>
              )}

              {!isViewer && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Fields
                </button>
              )}

              {transitionButtons.map((btn) => {
                const isBlocked = btn.requiresLead && !isLeadOrAdmin;
                return (
                  <button
                    key={btn.toStatus}
                    disabled={transitionMutation.isPending || isBlocked}
                    onClick={() =>
                      transitionMutation.mutate({
                        toStatus: btn.toStatus,
                        version: item.version,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      isBlocked
                        ? 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 cursor-not-allowed'
                        : btn.toStatus === 'Resolved'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                    }`}
                    title={isBlocked ? 'Requires Lead or Admin role' : ''}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    {btn.label}
                    {btn.requiresLead && !isLeadOrAdmin && (
                      <span className="text-[10px] text-amber-500 ml-1 font-mono">(Lead only)</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-800/80 text-xs">
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block">ASSIGNEE</span>
                <span className="text-zinc-200 font-medium">
                  {item.assignee_name || (
                    <span className="text-amber-400 font-mono">Unassigned</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-mono text-[10px] block">REPORTER</span>
                <span className="text-zinc-200 font-medium">{item.creator_name || 'System'}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-300 font-mono flex items-center gap-2 uppercase tracking-wider">
              <History className="w-4 h-4 text-zinc-400" />
              Append-Only Activity Ledger ({activityData?.activities?.length || 0})
            </h3>

            <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/80 p-4 space-y-3 max-h-64 overflow-y-auto">
              {activityData?.activities?.length === 0 ? (
                <div className="text-xs text-zinc-500">No events logged yet.</div>
              ) : (
                activityData?.activities?.map((evt: ActivityEvent) => (
                  <div key={evt.id} className="text-xs text-zinc-400 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                    <div className="flex-1">
                      <span className="text-zinc-200 font-medium">{evt.actor_name || 'System'}:</span>{' '}
                      <span className="font-mono text-zinc-300">[{evt.action}]</span>{' '}
                      {evt.from_value && (
                        <span>
                          from <span className="text-zinc-300 font-mono">{evt.from_value}</span>
                        </span>
                      )}{' '}
                      {evt.to_value && (
                        <span>
                          to <strong className="text-zinc-100 font-mono">{evt.to_value}</strong>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-300 font-mono flex items-center gap-2 uppercase tracking-wider">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              Operator Incident Notes ({commentsData?.comments?.length || 0})
            </h3>

            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {commentsData?.comments?.map((c: Comment) => (
                <div
                  key={c.id}
                  className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-zinc-200">{c.author_name}</span>
                    <span className="font-mono text-zinc-500 text-[10px]">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>

            {!isViewer && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (commentText.trim()) {
                    commentMutation.mutate(commentText);
                  }
                }}
                className="flex items-center gap-2 pt-2"
              >
                <input
                  type="text"
                  placeholder="Add operational notes or evidence log..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || commentMutation.isPending}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  Post
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
