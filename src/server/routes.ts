import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, transaction } from './db.js';
import { requireAuth, checkPermission, signToken, AuthenticatedRequest } from './auth.js';
import { ALLOWED_TRANSITIONS, ItemStatus, Priority } from './types.js';

export const apiRouter = Router();

// 1. AUTH & SESSION
apiRouter.post('/auth/login', async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const userRes = await query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
  }>('SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [email]);

  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const user = userRes.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const membershipsRes = await query<{
    team_id: string;
    team_name: string;
    role: any;
  }>(
    `SELECT m.team_id, t.name as team_name, m.role 
     FROM memberships m 
     JOIN teams t ON t.id = m.team_id 
     WHERE m.user_id = $1`,
    [user.id]
  );

  const token = signToken({ userId: user.id });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      memberships: membershipsRes.rows,
    },
  });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

apiRouter.get('/teams', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const teamIds = user.memberships.map((m) => m.team_id);

  if (teamIds.length === 0) {
    res.json({ teams: [] });
    return;
  }

  const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');
  const teams = await query(`SELECT id, name FROM teams WHERE id IN (${placeholders}) ORDER BY name ASC`, teamIds);
  res.json({ teams: teams.rows });
});

apiRouter.get('/users', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const teamIds = user.memberships.map((m) => m.team_id);

  if (teamIds.length === 0) {
    res.json({ users: [] });
    return;
  }

  const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');
  const users = await query(
    `SELECT DISTINCT u.id, u.name, u.email 
     FROM users u 
     JOIN memberships m ON m.user_id = u.id 
     WHERE m.team_id IN (${placeholders}) 
     ORDER BY u.name ASC`,
    teamIds
  );

  res.json({ users: users.rows });
});

// 2. DASHBOARD SUMMARY
apiRouter.get('/stats/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const teamIds = user.memberships.map((m) => m.team_id);

  if (teamIds.length === 0) {
    res.json({
      assignedToMe: [],
      unassignedUrgent: [],
      awaitingApproval: [],
    });
    return;
  }

  const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');

  const assigned = await query(
    `SELECT w.*, t.name as team_name, u.name as assignee_name 
     FROM work_items w 
     JOIN teams t ON t.id = w.team_id 
     LEFT JOIN users u ON u.id = w.assignee_id 
     WHERE w.assignee_id = $${teamIds.length + 1} 
       AND w.team_id IN (${placeholders}) 
       AND w.status NOT IN ('Closed', 'Resolved')
     ORDER BY 
       CASE w.priority 
         WHEN 'urgent' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'medium' THEN 3 
         ELSE 4 
       END, 
       w.created_at DESC 
     LIMIT 10`,
    [...teamIds, user.id]
  );

  const unassigned = await query(
    `SELECT w.*, t.name as team_name 
     FROM work_items w 
     JOIN teams t ON t.id = w.team_id 
     WHERE w.assignee_id IS NULL 
       AND w.team_id IN (${placeholders}) 
       AND w.status = 'Open' 
       AND w.priority IN ('urgent', 'high')
     ORDER BY 
       CASE w.priority WHEN 'urgent' THEN 1 ELSE 2 END, 
       w.created_at DESC 
     LIMIT 10`,
    teamIds
  );

  const leadTeamIds = user.memberships
    .filter((m) => m.role === 'Lead' || m.role === 'Admin')
    .map((m) => m.team_id);

  let awaiting: any[] = [];
  if (leadTeamIds.length > 0) {
    const leadPlaceholders = leadTeamIds.map((_, i) => `$${i + 1}`).join(',');
    const awaitingRes = await query(
      `SELECT w.*, t.name as team_name, u.name as assignee_name 
       FROM work_items w 
       JOIN teams t ON t.id = w.team_id 
       LEFT JOIN users u ON u.id = w.assignee_id 
       WHERE w.team_id IN (${leadPlaceholders}) 
         AND w.status = 'AwaitingApproval' 
       ORDER BY w.created_at DESC 
       LIMIT 10`,
      leadTeamIds
    );
    awaiting = awaitingRes.rows;
  }

  res.json({
    assignedToMe: assigned.rows,
    unassignedUrgent: unassigned.rows,
    awaitingApproval: awaiting,
  });
});

// 3. WORK ITEMS CRUD & BEHAVIORS
apiRouter.get('/items', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const userTeamIds = user.memberships.map((m) => m.team_id);

  if (userTeamIds.length === 0) {
    res.json({ items: [], nextCursor: null, totalCount: 0 });
    return;
  }

  const { status, priority, assignee, team, q, cursor } = req.query as Record<string, string>;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);

  const conditions: string[] = [];
  const params: any[] = [];

  if (team) {
    if (!userTeamIds.includes(team)) {
      res.json({ items: [], nextCursor: null, totalCount: 0 });
      return;
    }
    params.push(team);
    conditions.push(`w.team_id = $${params.length}`);
  } else {
    const placeholders = userTeamIds.map((id) => {
      params.push(id);
      return `$${params.length}`;
    });
    conditions.push(`w.team_id IN (${placeholders.join(',')})`);
  }

  if (status) {
    params.push(status);
    conditions.push(`w.status = $${params.length}`);
  }

  if (priority) {
    params.push(priority);
    conditions.push(`w.priority = $${params.length}`);
  }

  if (assignee) {
    if (assignee === 'unassigned') {
      conditions.push(`w.assignee_id IS NULL`);
    } else {
      params.push(assignee);
      conditions.push(`w.assignee_id = $${params.length}`);
    }
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    const pIdx = params.length;
    conditions.push(`(w.title ILIKE $${pIdx} OR w.description ILIKE $${pIdx})`);
  }

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [cursorTime, cursorId] = decoded.split(':::');
      if (cursorTime && cursorId) {
        params.push(cursorTime);
        const timeIdx = params.length;
        params.push(cursorId);
        const idIdx = params.length;
        conditions.push(`(w.created_at, w.id) < ($${timeIdx}::timestamptz, $${idIdx})`);
      }
    } catch {
      // Ignore invalid cursor
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit + 1);
  const limitIdx = params.length;

  const sql = `
    SELECT 
      w.*, 
      t.name as team_name, 
      u.name as assignee_name, 
      u.email as assignee_email,
      c.name as creator_name
    FROM work_items w
    JOIN teams t ON t.id = w.team_id
    LEFT JOIN users u ON u.id = w.assignee_id
    LEFT JOIN users c ON c.id = w.created_by
    ${whereClause}
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT $${limitIdx}
  `;

  const result = await query(sql, params);
  const rows = result.rows;

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const nextItem = rows.pop()!;
    const cursorStr = `${nextItem.created_at}:::${nextItem.id}`;
    nextCursor = Buffer.from(cursorStr).toString('base64');
  }

  res.json({
    items: rows,
    nextCursor,
  });
});

apiRouter.post('/items', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const { title, description, type, priority, team_id, due_date, assignee_id } = req.body;

  if (!title || !description || !type || !team_id) {
    res.status(400).json({ error: 'Missing required fields: title, description, type, team_id' });
    return;
  }

  const isMember = user.memberships.some((m) => m.team_id === team_id);
  if (!isMember) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  if (!checkPermission(user, team_id, 'create')) {
    res.status(403).json({ error: 'Viewers cannot create work items' });
    return;
  }

  const itemId = crypto.randomUUID();
  const validPriority: Priority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
  const validStatus: ItemStatus = 'Open';

  try {
    const createdItem = await transaction(async (tx) => {
      const itemRes = await tx.query(
        `INSERT INTO work_items 
         (id, title, description, type, priority, status, team_id, assignee_id, created_by, due_date, version, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
         RETURNING *`,
        [
          itemId,
          title.trim(),
          description.trim(),
          type,
          validPriority,
          validStatus,
          team_id,
          assignee_id || null,
          user.id,
          due_date || null,
        ]
      );

      await tx.query(
        `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
         VALUES ($1, $2, $3, 'created', NULL, 'Open', CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), itemId, user.id]
      );

      if (assignee_id) {
        await tx.query(
          `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
           VALUES ($1, $2, $3, 'assigned', NULL, $4, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), itemId, user.id, assignee_id]
        );

        const outboxPayload = JSON.stringify({
          itemId,
          assigneeId: assignee_id,
          itemTitle: title,
          action: 'assigned',
          dedupKey: `${itemId}-${assignee_id}-initial`,
        });

        await tx.query(
          `INSERT INTO outbox_jobs (id, type, payload, status, attempts, next_retry_at, created_at, updated_at)
           VALUES ($1, 'notify_assignee', $2, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), outboxPayload]
        );
      }

      return itemRes.rows[0];
    });

    res.status(201).json(createdItem);
  } catch (err: any) {
    console.error('Create item transaction error:', err);
    res.status(500).json({ error: 'Failed to create work item' });
  }
});

async function getItemWithAuth(itemId: string, user: AuthenticatedRequest['user']!) {
  const result = await query(
    `SELECT w.*, t.name as team_name, u.name as assignee_name, u.email as assignee_email, c.name as creator_name
     FROM work_items w
     JOIN teams t ON t.id = w.team_id
     LEFT JOIN users u ON u.id = w.assignee_id
     LEFT JOIN users c ON c.id = w.created_by
     WHERE w.id = $1`,
    [itemId]
  );

  if (result.rows.length === 0) {
    return { item: null, allowed: false };
  }

  const item = result.rows[0];
  const isMember = user.memberships.some((m) => m.team_id === item.team_id);
  if (!isMember) {
    return { item: null, allowed: false };
  }

  return { item, allowed: true };
}

apiRouter.get('/items/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { item } = await getItemWithAuth(id, req.user!);

  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  res.json(item);
});

// 1. CONCURRENT CLAIM
apiRouter.post('/items/:id/claim', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const { item } = await getItemWithAuth(id, user);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  if (!checkPermission(user, item.team_id, 'claim')) {
    res.status(403).json({ error: 'Viewers cannot claim work items' });
    return;
  }

  try {
    const updated = await transaction(async (tx) => {
      const claimRes = await tx.query(
        `UPDATE work_items 
         SET assignee_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND assignee_id IS NULL 
         RETURNING *`,
        [user.id, id]
      );

      if (claimRes.rowCount === 0) {
        return null;
      }

      await tx.query(
        `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
         VALUES ($1, $2, $3, 'assigned', NULL, $4, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), id, user.id, user.id]
      );

      const outboxPayload = JSON.stringify({
        itemId: id,
        assigneeId: user.id,
        itemTitle: item.title,
        action: 'claimed',
        dedupKey: `${id}-${user.id}-claim`,
      });

      await tx.query(
        `INSERT INTO outbox_jobs (id, type, payload, status, attempts, next_retry_at, created_at, updated_at)
         VALUES ($1, 'notify_assignee', $2, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), outboxPayload]
      );

      return claimRes.rows[0];
    });

    if (!updated) {
      res.status(409).json({
        error: 'Conflict: This work item has already been claimed by another operator.',
      });
      return;
    }

    res.json(updated);
  } catch (err: any) {
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Internal error processing claim' });
  }
});

// 2. STALE UPDATE / OPTIMISTIC LOCKING
apiRouter.patch('/items/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;
  const { version, title, description, priority, due_date, assignee_id } = req.body;

  if (version === undefined || version === null || typeof version !== 'number') {
    res.status(400).json({ error: 'Validation error: version is required for optimistic concurrency control' });
    return;
  }

  const { item } = await getItemWithAuth(id, user);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  if (!checkPermission(user, item.team_id, 'edit')) {
    res.status(403).json({ error: 'Forbidden: Insufficient permissions to edit this item' });
    return;
  }

  if (assignee_id !== undefined && assignee_id !== item.assignee_id) {
    if (assignee_id !== null && assignee_id !== user.id) {
      if (!checkPermission(user, item.team_id, 'reassign')) {
        res.status(403).json({ error: 'Only Leads or Admins can reassign work items to others' });
        return;
      }
    }
  }

  try {
    const updateResult = await transaction(async (tx) => {
      const sets: string[] = ['version = version + 1', 'updated_at = CURRENT_TIMESTAMP'];
      const params: any[] = [];

      if (title !== undefined) {
        params.push(title.trim());
        sets.push(`title = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description.trim());
        sets.push(`description = $${params.length}`);
      }
      if (priority !== undefined) {
        params.push(priority);
        sets.push(`priority = $${params.length}`);
      }
      if (due_date !== undefined) {
        params.push(due_date);
        sets.push(`due_date = $${params.length}`);
      }
      if (assignee_id !== undefined) {
        params.push(assignee_id);
        sets.push(`assignee_id = $${params.length}`);
      }

      params.push(id);
      const idIdx = params.length;
      params.push(version);
      const versionIdx = params.length;

      const sql = `
        UPDATE work_items 
        SET ${sets.join(', ')} 
        WHERE id = $${idIdx} AND version = $${versionIdx} 
        RETURNING *
      `;

      const res = await tx.query(sql, params);
      if (res.rowCount === 0) {
        return null;
      }

      const updatedItem = res.rows[0];

      if (priority !== undefined && priority !== item.priority) {
        await tx.query(
          `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
           VALUES ($1, $2, $3, 'priority_changed', $4, $5, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), id, user.id, item.priority, priority]
        );
      }

      if (assignee_id !== undefined && assignee_id !== item.assignee_id) {
        await tx.query(
          `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
           VALUES ($1, $2, $3, 'assigned', $4, $5, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), id, user.id, item.assignee_id, assignee_id]
        );

        if (assignee_id) {
          const outboxPayload = JSON.stringify({
            itemId: id,
            assigneeId: assignee_id,
            itemTitle: updatedItem.title,
            action: 'reassigned',
            dedupKey: `${id}-${assignee_id}-${updatedItem.version}`,
          });

          await tx.query(
            `INSERT INTO outbox_jobs (id, type, payload, status, attempts, next_retry_at, created_at, updated_at)
             VALUES ($1, 'notify_assignee', $2, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), outboxPayload]
          );
        }
      }

      return updatedItem;
    });

    if (!updateResult) {
      const latest = await query('SELECT * FROM work_items WHERE id = $1', [id]);
      res.status(409).json({
        error: 'Conflict: This item was modified by another operator. Please reload.',
        currentItem: latest.rows[0] || null,
      });
      return;
    }

    res.json(updateResult);
  } catch (err: any) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Internal error updating item' });
  }
});

// STATUS TRANSITION
apiRouter.post('/items/:id/transition', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;
  const { toStatus, version } = req.body;

  if (!toStatus) {
    res.status(400).json({ error: 'toStatus is required' });
    return;
  }

  const { item } = await getItemWithAuth(id, user);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  const currentStatus = item.status as ItemStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(toStatus as ItemStatus)) {
    res.status(400).json({
      error: `Invalid transition from '${currentStatus}' to '${toStatus}'. Allowed: ${allowed.join(', ')}`,
    });
    return;
  }

  if (currentStatus === 'AwaitingApproval' && toStatus === 'Resolved') {
    if (!checkPermission(user, item.team_id, 'approve')) {
      res.status(403).json({
        error: 'Forbidden: Only Team Leads or Admins can approve items awaiting approval.',
      });
      return;
    }
  }

  try {
    const updated = await transaction(async (tx) => {
      let sql: string;
      let params: any[];

      if (version !== undefined && version !== null) {
        sql = `
          UPDATE work_items 
          SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2 AND version = $3 
          RETURNING *
        `;
        params = [toStatus, id, version];
      } else {
        sql = `
          UPDATE work_items 
          SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2 
          RETURNING *
        `;
        params = [toStatus, id];
      }

      const res = await tx.query(sql, params);
      if (res.rowCount === 0) {
        return null;
      }

      await tx.query(
        `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
         VALUES ($1, $2, $3, 'status_changed', $4, $5, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), id, user.id, currentStatus, toStatus]
      );

      if (item.assignee_id) {
        const outboxPayload = JSON.stringify({
          itemId: id,
          assigneeId: item.assignee_id,
          itemTitle: item.title,
          action: `status_${toStatus}`,
          dedupKey: `${id}-${item.assignee_id}-${toStatus}-${res.rows[0].version}`,
        });

        await tx.query(
          `INSERT INTO outbox_jobs (id, type, payload, status, attempts, next_retry_at, created_at, updated_at)
           VALUES ($1, 'notify_assignee', $2, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), outboxPayload]
        );
      }

      return res.rows[0];
    });

    if (!updated) {
      const latest = await query('SELECT * FROM work_items WHERE id = $1', [id]);
      res.status(409).json({
        error: 'Conflict: Item has changed. Please reload.',
        currentItem: latest.rows[0] || null,
      });
      return;
    }

    res.json(updated);
  } catch (err: any) {
    console.error('Transition error:', err);
    res.status(500).json({ error: 'Internal error executing transition' });
  }
});

// COMMENTS
apiRouter.post('/items/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;
  const { body } = req.body;

  if (!body || !body.trim()) {
    res.status(400).json({ error: 'Comment body cannot be empty' });
    return;
  }

  const { item } = await getItemWithAuth(id, user);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  const commentId = crypto.randomUUID();

  try {
    const comment = await transaction(async (tx) => {
      const res = await tx.query(
        `INSERT INTO comments (id, work_item_id, author_id, body, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [commentId, id, user.id, body.trim()]
      );

      await tx.query(
        `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
         VALUES ($1, $2, $3, 'commented', NULL, $4, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), id, user.id, body.trim().slice(0, 100)]
      );

      return res.rows[0];
    });

    res.status(201).json({
      ...comment,
      author_name: user.name,
      author_email: user.email,
    });
  } catch (err: any) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

apiRouter.get('/items/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { item } = await getItemWithAuth(id, req.user!);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  const result = await query(
    `SELECT c.*, u.name as author_name, u.email as author_email
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.work_item_id = $1
     ORDER BY c.created_at ASC`,
    [id]
  );

  res.json({ comments: result.rows });
});

apiRouter.get('/items/:id/activity', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { item } = await getItemWithAuth(id, req.user!);
  if (!item) {
    res.status(404).json({ error: 'Work item not found' });
    return;
  }

  const result = await query(
    `SELECT a.*, u.name as actor_name
     FROM activity_events a
     JOIN users u ON u.id = a.actor_id
     WHERE a.work_item_id = $1
     ORDER BY a.created_at ASC`,
    [id]
  );

  res.json({ activities: result.rows });
});
