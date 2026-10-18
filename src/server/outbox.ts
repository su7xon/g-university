import { query } from './db.js';
import { OutboxJob } from './types.js';

export const sentNotifications: Array<{
  jobId: string;
  assigneeId: string;
  itemId: string;
  timestamp: string;
}> = [];

const processedNotificationKeys = new Set<string>();

export function clearNotificationLogs(): void {
  sentNotifications.length = 0;
  processedNotificationKeys.clear();
}

export async function handleNotifyAssignee(payload: {
  itemId: string;
  assigneeId: string;
  itemTitle?: string;
  action?: string;
  dedupKey?: string;
}, jobId: string): Promise<void> {
  const dedupKey = payload.dedupKey || `${jobId}-${payload.itemId}-${payload.assigneeId}`;

  if (processedNotificationKeys.has(dedupKey)) {
    return;
  }

  processedNotificationKeys.add(dedupKey);
  sentNotifications.push({
    jobId,
    assigneeId: payload.assigneeId,
    itemId: payload.itemId,
    timestamp: new Date().toISOString(),
  });

  console.log(`[OUTBOX WORKER] [NOTIFY_ASSIGNEE] Item #${payload.itemId} notification dispatched to Assignee #${payload.assigneeId}`);
}

export async function processJob(job: OutboxJob, simulateFailure = false): Promise<boolean> {
  const currentAttempts = job.attempts + 1;

  try {
    if (simulateFailure) {
      throw new Error('Simulated network/delivery dispatch failure');
    }

    if (job.type === 'notify_assignee') {
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      await handleNotifyAssignee(payload, job.id);
    }

    await query(
      `UPDATE outbox_jobs 
       SET status = 'completed', attempts = $1, last_error = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [currentAttempts, job.id]
    );

    return true;
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown processing error';

    if (currentAttempts >= (job.max_attempts || 5)) {
      await query(
        `UPDATE outbox_jobs 
         SET status = 'failed', attempts = $1, last_error = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [currentAttempts, errorMsg, job.id]
      );
    } else {
      const backoffSeconds = Math.pow(2, currentAttempts);
      await query(
        `UPDATE outbox_jobs 
         SET status = 'pending', attempts = $1, last_error = $2, 
             next_retry_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::INTERVAL, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4`,
        [currentAttempts, errorMsg, backoffSeconds.toString(), job.id]
      );
    }

    return false;
  }
}

export async function processOutboxBatch(limit = 10): Promise<number> {
  const res = await query<OutboxJob>(
    `SELECT * FROM outbox_jobs 
     WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP 
     ORDER BY created_at ASC 
     LIMIT $1`,
    [limit]
  );

  let processed = 0;
  for (const job of res.rows) {
    const claim = await query(
      `UPDATE outbox_jobs 
       SET status = 'processing', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND status = 'pending'`,
      [job.id]
    );

    if (claim.rowCount > 0) {
      await processJob(job);
      processed++;
    }
  }

  return processed;
}

let workerInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker(intervalMs = 3000): void {
  if (workerInterval) return;

  workerInterval = setInterval(async () => {
    try {
      await processOutboxBatch(10);
    } catch {
      // Suppress transient loop errors
    }
  }, intervalMs);
}

export function stopOutboxWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
