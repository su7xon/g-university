import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createApp } from '../src/server/app.js';
import { initDb, closeDb, query } from '../src/server/db.js';
import { signToken } from '../src/server/auth.js';
import { processJob, sentNotifications, clearNotificationLogs } from '../src/server/outbox.js';
import { OutboxJob } from '../src/server/types.js';

describe('Newtonite - 5 Critical Behaviors Test Suite', () => {
  let app: any;
  let user1Token: string;
  let user2Token: string;
  let userOutsideTeamToken: string;
  let teamId: string;
  let outsideTeamId: string;

  beforeAll(async () => {
    await initDb({ inMemoryOnly: true });
    app = createApp();

    const passwordHash = await bcrypt.hash('password123', 8);

    teamId = 'team-alpha';
    outsideTeamId = 'team-beta';

    await query(`INSERT INTO teams (id, name) VALUES ($1, $2)`, [teamId, 'Alpha Team']);
    await query(`INSERT INTO teams (id, name) VALUES ($1, $2)`, [outsideTeamId, 'Beta Team']);

    const u1Id = 'u-member-1';
    const u2Id = 'u-member-2';
    const uOutsideId = 'u-outside-team';

    await query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`, [
      u1Id, 'Member One', 'member1@test.internal', passwordHash,
    ]);
    await query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`, [
      u2Id, 'Member Two', 'member2@test.internal', passwordHash,
    ]);
    await query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`, [
      uOutsideId, 'Outside Member', 'outside@test.internal', passwordHash,
    ]);

    await query(`INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Member')`, [u1Id, teamId]);
    await query(`INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Member')`, [u2Id, teamId]);
    await query(`INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Member')`, [uOutsideId, outsideTeamId]);

    user1Token = signToken({ userId: u1Id });
    user2Token = signToken({ userId: u2Id });
    userOutsideTeamToken = signToken({ userId: uOutsideId });
  });

  afterAll(async () => {
    await closeDb();
  });

  // 1. CONCURRENT CLAIM
  it('1. CONCURRENT CLAIM: exactly one operator claims unassigned item when fired in parallel', async () => {
    const itemId = 'item-claim-' + crypto.randomUUID();
    await query(
      `INSERT INTO work_items (id, title, description, type, priority, status, team_id, assignee_id, created_by, version)
       VALUES ($1, $2, $3, 'incident', 'urgent', 'Open', $4, NULL, 'u-member-1', 1)`,
      [itemId, 'Critical DB Outage', 'Connection spike', teamId]
    );

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${user1Token}`),
      request(app)
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${user2Token}`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const itemInDb = await query('SELECT * FROM work_items WHERE id = $1', [itemId]);
    expect(itemInDb.rows[0].version).toBe(2);
    expect(itemInDb.rows[0].assignee_id).not.toBeNull();
  });

  // 2. STALE UPDATE / OPTIMISTIC LOCKING
  it('2. STALE UPDATE: update with old version rejected with 409 and latest item payload', async () => {
    const itemId = 'item-stale-' + crypto.randomUUID();
    await query(
      `INSERT INTO work_items (id, title, description, type, priority, status, team_id, assignee_id, created_by, version)
       VALUES ($1, $2, $3, 'incident', 'medium', 'Open', $4, 'u-member-1', 'u-member-1', 1)`,
      [itemId, 'Initial Title', 'Initial Desc', teamId]
    );

    const firstUpdate = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        version: 1,
        title: 'Title updated by Operator A',
      });

    expect(firstUpdate.status).toBe(200);
    expect(firstUpdate.body.version).toBe(2);
    expect(firstUpdate.body.title).toBe('Title updated by Operator A');

    const staleUpdate = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        version: 1,
        title: 'Conflicting edit by Operator B',
      });

    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.error).toContain('modified by another operator');
    expect(staleUpdate.body.currentItem.version).toBe(2);
    expect(staleUpdate.body.currentItem.title).toBe('Title updated by Operator A');
  });

  // 3. IDEMPOTENCY
  it('3. IDEMPOTENCY: identical Idempotency-Key header returns stored response and creates only one item', async () => {
    const idempotencyKey = 'key-test-' + crypto.randomUUID();
    const itemPayload = {
      title: 'Idempotency Test Item',
      description: 'Verifying replay tolerance',
      type: 'task',
      priority: 'high',
      team_id: teamId,
    };

    const res1 = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${user1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(itemPayload);

    expect(res1.status).toBe(201);
    const createdId = res1.body.id;
    expect(createdId).toBeDefined();

    const res2 = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${user1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(itemPayload);

    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(createdId);
    expect(res2.headers['x-cache-lookup']).toBe('HIT-IDEMPOTENT');

    const countCheck = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM work_items WHERE title = $1',
      [itemPayload.title]
    );
    expect(parseInt(countCheck.rows[0].count, 10)).toBe(1);

    const keyCheck = await query('SELECT * FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
    expect(keyCheck.rows.length).toBe(1);
    expect(keyCheck.rows[0].response_status).toBe(201);
  });

  // 4. RESOURCE-LEVEL AUTHORIZATION
  it('4. RESOURCE-LEVEL AUTHORIZATION: user outside item team gets 404 (not 403)', async () => {
    const itemId = 'item-private-' + crypto.randomUUID();
    await query(
      `INSERT INTO work_items (id, title, description, type, priority, status, team_id, created_by, version)
       VALUES ($1, $2, $3, 'compliance', 'high', 'Open', $4, 'u-member-1', 1)`,
      [itemId, 'Confidential Audit', 'Secret internal memo', teamId]
    );

    const getRes = await request(app)
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${userOutsideTeamToken}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body.error).toContain('not found');

    const patchRes = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${userOutsideTeamToken}`)
      .send({ version: 1, title: 'Unauthorized modification' });

    expect(patchRes.status).toBe(404);
  });

  // 5. RELIABLE ASYNC JOBS + ACTIVITY LOG
  it('5. RELIABLE ASYNC JOBS + ACTIVITY LOG: transactional atomicity, idempotency, and retry backoff', async () => {
    clearNotificationLogs();

    const itemId = 'item-atomicity-' + crypto.randomUUID();
    const createRes = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        title: 'Kafka Consumer Lag Spike',
        description: 'Offsets lagging by 50k messages',
        type: 'incident',
        priority: 'urgent',
        team_id: teamId,
        assignee_id: 'u-member-2',
      });

    expect(createRes.status).toBe(201);
    const createdItemId = createRes.body.id;

    const events = await query(
      'SELECT * FROM activity_events WHERE work_item_id = $1 ORDER BY created_at ASC',
      [createdItemId]
    );
    expect(events.rows.length).toBeGreaterThanOrEqual(1);
    expect(events.rows.some((e) => e.action === 'created')).toBe(true);

    const jobs = await query<OutboxJob>(
      `SELECT * FROM outbox_jobs WHERE payload::text LIKE $1 AND status = 'pending'`,
      [`%${createdItemId}%`]
    );
    expect(jobs.rows.length).toBe(1);
    const job = jobs.rows[0];

    await processJob(job);
    await processJob(job);

    expect(sentNotifications.length).toBe(1);
    expect(sentNotifications[0].assigneeId).toBe('u-member-2');
    expect(sentNotifications[0].itemId).toBe(createdItemId);

    const failJobId = 'job-fail-' + crypto.randomUUID();
    await query(
      `INSERT INTO outbox_jobs (id, type, payload, status, attempts, max_attempts)
       VALUES ($1, 'notify_assignee', $2, 'pending', 0, 5)`,
      [failJobId, JSON.stringify({ itemId: 'item-x', assigneeId: 'u-1' })]
    );

    let currentJob = (await query<OutboxJob>('SELECT * FROM outbox_jobs WHERE id = $1', [failJobId])).rows[0];

    for (let attempt = 1; attempt <= 4; attempt++) {
      const success = await processJob(currentJob, true);
      expect(success).toBe(false);
      currentJob = (await query<OutboxJob>('SELECT * FROM outbox_jobs WHERE id = $1', [failJobId])).rows[0];
      expect(currentJob.attempts).toBe(attempt);
      expect(currentJob.status).toBe('pending');
      expect(currentJob.last_error).toContain('Simulated');
    }

    const finalSuccess = await processJob(currentJob, true);
    expect(finalSuccess).toBe(false);
    currentJob = (await query<OutboxJob>('SELECT * FROM outbox_jobs WHERE id = $1', [failJobId])).rows[0];
    expect(currentJob.attempts).toBe(5);
    expect(currentJob.status).toBe('failed');
  });
});
