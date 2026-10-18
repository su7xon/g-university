export interface UserSession {
  id: string;
  name: string;
  email: string;
  memberships: {
    team_id: string;
    team_name: string;
    role: 'Viewer' | 'Member' | 'Lead' | 'Admin';
  }[];
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: 'incident' | 'customer_issue' | 'payment' | 'compliance' | 'task';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'Open' | 'InProgress' | 'AwaitingApproval' | 'Resolved' | 'Closed';
  team_id: string;
  assignee_id: string | null;
  created_by: string;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  team_name?: string;
  assignee_name?: string | null;
  assignee_email?: string | null;
  creator_name?: string;
}

export interface ActivityEvent {
  id: string;
  work_item_id: string;
  actor_id: string;
  actor_name?: string;
  action: 'created' | 'assigned' | 'status_changed' | 'priority_changed' | 'commented';
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  work_item_id: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  body: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function fetchWithAuth(url: string, token: string | null, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = (typeof data === 'object' && data?.error) ? data.error : res.statusText || 'API Request failed';
    throw new ApiError(res.status, errorMsg, data);
  }

  return data;
}

export const api = {
  login: async (email: string, password: string): Promise<{ token: string; user: UserSession }> => {
    return fetchWithAuth('/api/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getMe: async (token: string): Promise<{ user: UserSession }> => {
    return fetchWithAuth('/api/auth/me', token);
  },

  getTeams: async (token: string): Promise<{ teams: Team[] }> => {
    return fetchWithAuth('/api/teams', token);
  },

  getUsers: async (token: string): Promise<{ users: UserSummary[] }> => {
    return fetchWithAuth('/api/users', token);
  },

  getDashboardStats: async (token: string): Promise<{
    assignedToMe: WorkItem[];
    unassignedUrgent: WorkItem[];
    awaitingApproval: WorkItem[];
  }> => {
    return fetchWithAuth('/api/stats/dashboard', token);
  },

  getItems: async (
    token: string,
    filters: {
      status?: string;
      priority?: string;
      assignee?: string;
      team?: string;
      q?: string;
      cursor?: string | null;
      limit?: number;
    }
  ): Promise<{ items: WorkItem[]; nextCursor: string | null }> => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.assignee) params.set('assignee', filters.assignee);
    if (filters.team) params.set('team', filters.team);
    if (filters.q) params.set('q', filters.q);
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.limit) params.set('limit', filters.limit.toString());

    return fetchWithAuth(`/api/items?${params.toString()}`, token);
  },

  getItemById: async (token: string, id: string): Promise<WorkItem> => {
    return fetchWithAuth(`/api/items/${id}`, token);
  },

  createItem: async (
    token: string,
    payload: {
      title: string;
      description: string;
      type: string;
      priority: string;
      team_id: string;
      assignee_id?: string | null;
      due_date?: string | null;
    },
    idempotencyKey?: string
  ): Promise<WorkItem> => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return fetchWithAuth('/api/items', token, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  updateItem: async (
    token: string,
    id: string,
    payload: {
      version: number;
      title?: string;
      description?: string;
      priority?: string;
      assignee_id?: string | null;
      due_date?: string | null;
    }
  ): Promise<WorkItem> => {
    return fetchWithAuth(`/api/items/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  claimItem: async (token: string, id: string): Promise<WorkItem> => {
    return fetchWithAuth(`/api/items/${id}/claim`, token, {
      method: 'POST',
    });
  },

  transitionItem: async (
    token: string,
    id: string,
    payload: { toStatus: string; version: number }
  ): Promise<WorkItem> => {
    return fetchWithAuth(`/api/items/${id}/transition`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getComments: async (token: string, itemId: string): Promise<{ comments: Comment[] }> => {
    return fetchWithAuth(`/api/items/${itemId}/comments`, token);
  },

  addComment: async (token: string, itemId: string, body: string): Promise<Comment> => {
    return fetchWithAuth(`/api/items/${itemId}/comments`, token, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },

  getActivity: async (token: string, itemId: string): Promise<{ activities: ActivityEvent[] }> => {
    return fetchWithAuth(`/api/items/${itemId}/activity`, token);
  },
};
