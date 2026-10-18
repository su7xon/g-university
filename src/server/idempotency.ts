import { Request, Response, NextFunction } from 'express';
import { query } from './db.js';

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'POST') {
      return next();
    }

    const idempotencyKey = (
      req.headers['idempotency-key'] || req.headers['Idempotency-Key']
    ) as string | undefined;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return next();
    }

    const key = idempotencyKey.trim();

    try {
      const existing = await query<{
        response_status: number;
        response_body: string;
        expires_at: string;
      }>(
        `SELECT response_status, response_body, expires_at 
         FROM idempotency_keys 
         WHERE key = $1 AND expires_at > CURRENT_TIMESTAMP`,
        [key]
      );

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
        res.status(record.response_status);
        try {
          res.json(JSON.parse(record.response_body));
        } catch {
          res.send(record.response_body);
        }
        return;
      }

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      let saved = false;

      const saveIdempotentResponse = async (status: number, body: string) => {
        if (saved) return;
        saved = true;
        try {
          await query(
            `INSERT INTO idempotency_keys (key, method, path, response_status, response_body, created_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours')
             ON CONFLICT (key) DO UPDATE 
             SET response_status = EXCLUDED.response_status,
                 response_body = EXCLUDED.response_body,
                 expires_at = EXCLUDED.expires_at`,
            [key, req.method, req.path, status, body]
          );
        } catch (err) {
          console.error('Failed to store idempotency key:', err);
        }
      };

      res.json = function (body: any) {
        const stringified = JSON.stringify(body);
        saveIdempotentResponse(res.statusCode, stringified).finally(() => {
          originalJson(body);
        });
        return res;
      };

      res.send = function (body: any) {
        const stringified = typeof body === 'string' ? body : JSON.stringify(body);
        saveIdempotentResponse(res.statusCode, stringified).finally(() => {
          originalSend(body);
        });
        return res;
      };

      next();
    } catch (err) {
      console.error('Idempotency middleware error:', err);
      next();
    }
  };
}
