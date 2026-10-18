import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser, ActionPermission, Role } from './types.js';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'newtonite-operations-under-pressure-secure-jwt-key';

export function signToken(payload: { userId: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export function checkPermission(
  user: AuthUser,
  teamId: string,
  action: ActionPermission
): boolean {
  if (!user || !user.memberships) {
    return false;
  }

  const membership = user.memberships.find((m) => m.team_id === teamId);
  if (!membership) {
    return false;
  }

  const role = membership.role;

  switch (role) {
    case 'Admin':
      return true;

    case 'Lead':
      return [
        'read',
        'create',
        'edit',
        'claim',
        'reassign',
        'approve',
      ].includes(action);

    case 'Member':
      return ['read', 'create', 'edit', 'claim'].includes(action);

    case 'Viewer':
      return action === 'read';

    default:
      return false;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  try {
    const userRes = await query<{
      id: string;
      name: string;
      email: string;
    }>('SELECT id, name, email FROM users WHERE id = $1', [decoded.userId]);

    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }

    const membershipsRes = await query<{
      team_id: string;
      team_name: string;
      role: Role;
    }>(
      `SELECT m.team_id, t.name as team_name, m.role 
       FROM memberships m 
       JOIN teams t ON t.id = m.team_id 
       WHERE m.user_id = $1`,
      [decoded.userId]
    );

    req.user = {
      id: userRes.rows[0].id,
      name: userRes.rows[0].name,
      email: userRes.rows[0].email,
      memberships: membershipsRes.rows,
    };

    next();
  } catch (err: any) {
    console.error('Auth middleware database error:', err);
    res.status(500).json({ error: 'Internal error loading user credentials.' });
  }
}
