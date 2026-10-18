/**
 * Newtonite Domain Types & Contracts
 */

export type Role = 'Viewer' | 'Member' | 'Lead' | 'Admin';

export type ItemType = 'incident' | 'customer_issue' | 'payment' | 'compliance' | 'task';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ItemStatus = 'Open' | 'InProgress' | 'AwaitingApproval' | 'Resolved' | 'Closed';

export type ActivityAction =
  | 'created'
  | 'assigned'
  | 'status_changed'
  | 'priority_changed'
  | 'commented';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface Membership {
  user_id: string;
  team_id: string;
  role: Role;
  created_at: string;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: ItemType;
  priority: Priority;
  status: ItemStatus;
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
  action: ActivityAction;
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

export interface IdempotencyRecord {
  key: string;
  method: string;
  path: string;
  response_status: number;
  response_body: string;
  created_at: string;
  expires_at: string;
}

export interface OutboxJob {
  id: string;
  type: string;
  payload: any;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  memberships: {
    team_id: string;
    team_name: string;
    role: Role;
  }[];
}

export type ActionPermission =
  | 'read'
  | 'create'
  | 'edit'
  | 'claim'
  | 'reassign'
  | 'approve'
  | 'admin_all';

export const ALLOWED_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  Open: ['InProgress'],
  InProgress: ['AwaitingApproval', 'Resolved'],
  AwaitingApproval: ['Resolved', 'InProgress'],
  Resolved: ['Closed', 'InProgress'],
  Closed: ['Open'],
};
