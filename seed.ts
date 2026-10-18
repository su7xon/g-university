import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { initDb, query, transaction } from './src/server/db.js';

export async function runSeed(totalItems = 3000) {
  console.log('--- Commencing Newtonite Database Seeding ---');
  await initDb();

  const passwordHash = await bcrypt.hash('password123', 8);

  // 1. Define Teams
  const teams = [
    { id: 'team-infra-01', name: 'Core Infrastructure & SRE' },
    { id: 'team-payments-02', name: 'Payments & Settlement' },
    { id: 'team-trust-03', name: 'Trust & Compliance' },
    { id: 'team-ops-04', name: 'Customer Escalations' },
  ];

  for (const t of teams) {
    await query(
      `INSERT INTO teams (id, name, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [t.id, t.name]
    );
  }
  console.log(`✓ Seeded ${teams.length} teams`);

  // 2. Define 10 Users
  const users = [
    { id: 'usr-admin-alex', name: 'Alex Vance (Global Admin)', email: 'alex.admin@newtonite.internal' },
    { id: 'usr-lead-sarah', name: 'Sarah Chen (Infra Lead)', email: 'sarah.lead@newtonite.internal' },
    { id: 'usr-lead-elena', name: 'Elena Rostova (Payments Lead)', email: 'elena.lead@newtonite.internal' },
    { id: 'usr-lead-marcus', name: 'Marcus Thorne (Trust Lead)', email: 'marcus.lead@newtonite.internal' },
    { id: 'usr-mem-dave', name: 'Dave Miller (Senior SRE)', email: 'dave.member@newtonite.internal' },
    { id: 'usr-mem-priya', name: 'Priya Patel (Payments Ops)', email: 'priya.member@newtonite.internal' },
    { id: 'usr-mem-carlos', name: 'Carlos Gomez (Compliance Analyst)', email: 'carlos.member@newtonite.internal' },
    { id: 'usr-mem-maya', name: 'Maya Lin (Escalation Specialist)', email: 'maya.member@newtonite.internal' },
    { id: 'usr-view-sam', name: 'Sam Taylor (Audit Viewer)', email: 'sam.viewer@newtonite.internal' },
    { id: 'usr-view-olivia', name: 'Olivia Scott (Stakeholder Viewer)', email: 'olivia.viewer@newtonite.internal' },
  ];

  for (const u of users) {
    await query(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
      [u.id, u.name, u.email, passwordHash]
    );
  }
  console.log(`✓ Seeded ${users.length} users with password 'password123'`);

  // 3. Define Memberships
  const memberships: Array<{ user_id: string; team_id: string; role: string }> = [
    { user_id: 'usr-admin-alex', team_id: 'team-infra-01', role: 'Admin' },
    { user_id: 'usr-admin-alex', team_id: 'team-payments-02', role: 'Admin' },
    { user_id: 'usr-admin-alex', team_id: 'team-trust-03', role: 'Admin' },
    { user_id: 'usr-admin-alex', team_id: 'team-ops-04', role: 'Admin' },

    { user_id: 'usr-lead-sarah', team_id: 'team-infra-01', role: 'Lead' },
    { user_id: 'usr-lead-elena', team_id: 'team-payments-02', role: 'Lead' },
    { user_id: 'usr-lead-marcus', team_id: 'team-trust-03', role: 'Lead' },

    { user_id: 'usr-mem-dave', team_id: 'team-infra-01', role: 'Member' },
    { user_id: 'usr-mem-dave', team_id: 'team-payments-02', role: 'Member' },
    { user_id: 'usr-mem-priya', team_id: 'team-payments-02', role: 'Member' },
    { user_id: 'usr-mem-carlos', team_id: 'team-trust-03', role: 'Member' },
    { user_id: 'usr-mem-maya', team_id: 'team-ops-04', role: 'Member' },

    { user_id: 'usr-view-sam', team_id: 'team-infra-01', role: 'Viewer' },
    { user_id: 'usr-view-sam', team_id: 'team-payments-02', role: 'Viewer' },
    { user_id: 'usr-view-olivia', team_id: 'team-trust-03', role: 'Viewer' },
    { user_id: 'usr-view-olivia', team_id: 'team-ops-04', role: 'Viewer' },
  ];

  for (const m of memberships) {
    await query(
      `INSERT INTO memberships (user_id, team_id, role, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role`,
      [m.user_id, m.team_id, m.role]
    );
  }
  console.log(`✓ Seeded ${memberships.length} team memberships`);

  const countRes = await query<{ count: string }>('SELECT COUNT(*) as count FROM work_items');
  const existingCount = parseInt(countRes.rows[0].count, 10);
  if (existingCount >= totalItems) {
    console.log(`Database already has ${existingCount} items. Skipping bulk creation.`);
    return;
  }

  const itemsToCreate = totalItems - existingCount;
  console.log(`Generating ${itemsToCreate} sample work items to demonstrate server-side cursor pagination...`);

  const types = ['incident', 'customer_issue', 'payment', 'compliance', 'task'];
  const priorities = ['low', 'medium', 'high', 'urgent'];
  const statuses = ['Open', 'InProgress', 'AwaitingApproval', 'Resolved', 'Closed'];

  const sampleTitles = [
    'Database connection pool exhaustion under spike',
    'Stripe webhook delivery signature mismatch',
    'PCI DSS audit evidence collection for Q4',
    'High latency on settlement reconciliation batch',
    'Customer account takeover flag triggered',
    'TLS certificate renewal on edge gateway',
    'Kafka offset lag in ledger consumer group',
    'Chargeback notification dispute processing',
    'GDPR subject access request #9021',
    'Redis replication cluster failover test',
    'Idempotency key cache memory degradation',
    'Elevated 502 rate on checkout ingress route',
  ];

  const batchSize = 250;
  const now = Date.now();

  for (let b = 0; b < itemsToCreate; b += batchSize) {
    const currentBatchSize = Math.min(batchSize, itemsToCreate - b);
    await transaction(async (tx) => {
      for (let i = 0; i < currentBatchSize; i++) {
        const itemIdx = b + i;
        const itemId = crypto.randomUUID();
        const team = teams[itemIdx % teams.length];
        const type = types[itemIdx % types.length];
        const priority = priorities[itemIdx % priorities.length];
        const status = statuses[itemIdx % statuses.length];
        const titleBase = sampleTitles[itemIdx % sampleTitles.length];
        const title = `${titleBase} [REF-${String(itemIdx + 1).padStart(5, '0')}]`;
        const description = `Operational telemetry logged an issue in ${team.name}. Requires verification and adherence to SLO policies. System health metrics affected under load.`;

        const assigneeId =
          itemIdx % 3 === 0
            ? null
            : users[(itemIdx % (users.length - 2))].id;

        const creator = users[itemIdx % users.length].id;
        const timeOffsetMs = (itemIdx + 1) * 60 * 1000;
        const itemCreatedAt = new Date(now - timeOffsetMs).toISOString();

        await tx.query(
          `INSERT INTO work_items 
           (id, title, description, type, priority, status, team_id, assignee_id, created_by, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10::timestamptz, $10::timestamptz)`,
          [itemId, title, description, type, priority, status, team.id, assigneeId, creator, itemCreatedAt]
        );

        await tx.query(
          `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
           VALUES ($1, $2, $3, 'created', NULL, 'Open', $4::timestamptz)`,
          [crypto.randomUUID(), itemId, creator, itemCreatedAt]
        );

        if (assigneeId) {
          await tx.query(
            `INSERT INTO activity_events (id, work_item_id, actor_id, action, from_value, to_value, created_at)
             VALUES ($1, $2, $3, 'assigned', NULL, $4, $5::timestamptz)`,
            [crypto.randomUUID(), itemId, creator, assigneeId, itemCreatedAt]
          );
        }
      }
    });

    if ((b + currentBatchSize) % 1000 === 0 || b + currentBatchSize >= itemsToCreate) {
      console.log(`  Processed ${b + currentBatchSize} / ${itemsToCreate} items...`);
    }
  }

  console.log(`✓ Completed database seed! Total work items: ${totalItems}`);
}

runSeed(3000)
  .then(() => {
    console.log('Seed script finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
