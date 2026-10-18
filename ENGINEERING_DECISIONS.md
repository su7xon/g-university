# Newtonite: Architectural & Engineering Decisions

This document records the foundational architectural decisions made while engineering **Newtonite - Operations Under Pressure**. Newtonite replaces chaotic chat rooms and spreadsheet triage with an uncompromising, state-consistent operational platform.

---

## 1. Data Model & History (Append-Only Audit Ledger)

### Context
Operational incidents, payment disputes, and compliance work items frequently change status, priority, and assignees. In post-mortems and compliance audits, operations teams must know who touched what, when, and from what initial value to what new value.

### Options Considered
1. **In-place mutable state only**: Simple columns on `work_items` (`status`, `priority`, `assignee_id`) overwritten on update.
2. **Event Sourcing (Full state derived from event stream)**: Store only raw events and project the current state on demand.
3. **Dual State Pattern (Current state snapshot table + Append-only activity ledger)**: Maintain current indexed `work_items` rows for low-latency queries while recording immutable `activity_events` in the exact same database transaction.

### Choice
**Option 3: Dual State Pattern with Strict Transactional Writes.**
The `work_items` table stores mutable state with an atomic incrementing `version` column. Every mutating endpoint (`/items`, `/items/:id`, `/items/:id/claim`, `/items/:id/transition`, `/items/:id/comments`) writes to `activity_events` inside the **same atomic database transaction**. If the activity event fails to write, the item mutation rolls back entirely.

### Trade-offs
- **Pros**: Sub-millisecond indexed queries and filtering without projection lag; complete, tamper-evident audit history from creation to resolution; zero risk of state drifting from historical logs.
- **Cons**: Requires double-writes per mutation (more disk I/O); requires transaction scoping around every mutation.

---

## 2. Concurrency Control (Atomic Single-Writer Claim & Optimistic Locking)

### Context
Under high operational pressure (e.g. SEV-1 incidents or flash payment volume), multiple operators view the triage queue simultaneously. Without strict concurrency controls, two operators will claim the same ticket ("double-claiming"), or Operator A will overwrite edits made by Operator B 200ms earlier ("lost update problem").

### Options Considered
1. **Pessimistic Locking (`SELECT FOR UPDATE`)**: Lock rows during reading and hold the lock until the HTTP response terminates.
2. **Last-Write-Wins (LWW)**: Blind updates with timestamps (`UPDATE work_items SET ... WHERE id = $id`).
3. **Condition-based Atomic Claim + Versioned Optimistic Locking**:
   - Claim: Atomic conditional query `UPDATE work_items SET assignee_id=$userId, version=version+1 WHERE id=$id AND assignee_id IS NULL`.
   - Update: Version-conditioned query `UPDATE work_items SET ..., version=version+1 WHERE id=$id AND version=$clientVersion`.

### Choice
**Option 3: Condition-based Atomic Claim + Optimistic Locking.**
- For claiming: The `WHERE id=$id AND assignee_id IS NULL` predicate guarantees at the database row level that only the first incoming query can claim the item. If `rowCount === 0`, Newtonite immediately returns `409 Conflict`.
- For editing & state transitions: The client must supply the current integer `version`. If another operator updated the item in the interim, the version mismatch causes `rowCount === 0`. The server immediately returns `409 Conflict` containing the newest record payload, and the client UI rolls back optimistic state and prompts the user to reload.

### Trade-offs
- **Pros**: Non-blocking reads; eliminates database deadlocks caused by long-held row locks; zero risk of silent lost updates; testable deterministic behavior under high concurrency.
- **Cons**: On write collision, the losing operator must reload and re-apply changes; clients must track and pass `version` tokens on every mutation.

---

## 3. Authorization Model (Resource-Level Scoping & Role Gates)

### Context
Multiple functional domains (Core Infrastructure, Payments, Trust & Compliance, Customer Escalations) operate on Newtonite. A user belongs to one or more teams with distinct roles (`Viewer`, `Member`, `Lead`, `Admin`). Information disclosure (e.g. leaking whether an item ID exists in a confidential compliance team) must be prevented.

### Options Considered
1. **Frontend-Only Role Checks**: Hiding UI buttons based on decoded JWT claims, with permissive backend endpoints.
2. **Global Roles (RBAC)**: Single role per user across the entire platform.
3. **Domain-Scoped Membership RBAC with Single Authorizer & 404 Leaking Prevention**:
   - Single central `checkPermission(user, teamId, action)` function enforced on every mutating backend endpoint.
   - Every read query explicitly scoped to `user.memberships.map(m => m.team_id)`.
   - Unauthenticated or unauthorized access to an item outside the user's teams yields `404 Not Found` (never `403 Forbidden`).

### Choice
**Option 3: Centralized Server-Enforced Resource Authorization with 404 Cloaking.**
Permissions are strictly defined:
- `Viewer`: Read-only.
- `Member`: Create items, edit non-restricted fields, claim unassigned items.
- `Lead`: Approve transitions (`AwaitingApproval` -> `Resolved`), reassign operators, plus Member actions.
- `Admin`: Full permissions across all teams.
When a user requests an item belonging to a team they do not belong to, the server returns `404 Not Found`.

### Trade-offs
- **Pros**: Complete protection against IDOR (Insecure Direct Object References) and enumeration attacks; prevents malicious or accidental cross-team data leaks; no frontend bypasses possible.
- **Cons**: Requires fetching user team memberships on every authenticated request (mitigated by fast indexed join); users with `Viewer` role cannot collaborate in comments without explicit role elevation.

---

## 4. Synchronous vs. Asynchronous Work (Transactional Outbox Pattern)

### Context
When work items are assigned, claimed, or escalated, external notifications and integrations must be dispatched. Sending emails, Slack alerts, or webhooks synchronously inside the HTTP handler creates latency spikes, risks connection timeouts, and introduces two-phase commit failures (e.g. database commits, but notification call crashes, or vice versa).

### Options Considered
1. **Synchronous dispatch**: Call external notification APIs directly inside the Express request handler before returning `200 OK`.
2. **Fire-and-forget in-memory queue**: `setImmediate` or Node.js EventEmitter.
3. **Transactional Outbox Table with Idempotent Asynchronous Worker Loop**:
   - The mutating SQL transaction inserts the `outbox_jobs` row in the **same database transaction** as the `work_items` update.
   - An independent worker processes pending jobs asynchronously, retrying failed jobs with exponential backoff up to 5 attempts.
   - Outbox handlers enforce idempotency to prevent duplicate notifications during network retries.

### Choice
**Option 3: Transactional Outbox Pattern.**
Newtonite writes the notification job to the `outbox_jobs` table in the same transaction as the work item and activity log. If the database transaction rolls back, no orphan notification is ever queued. The background worker picks up pending jobs (`next_retry_at <= NOW()`), executes them idempotently, and applies exponential backoff on transient dispatch failures.

### Trade-offs
- **Pros**: Guarantees at-least-once message delivery; isolates HTTP response latencies from external network degradation; zero lost events on app crashes; fully auditable job ledger.
- **Cons**: Slight asynchronous delay (~500ms - 2s) between item state change and notification receipt; requires outbox consumer maintenance and table pruning.

---

## 5. Search & Pagination (Server-Side ILIKE & Keyset/Cursor-Based Pagination)

### Context
The platform manages tens of thousands of work items (seeded with 3,000+ records to prove scalability). Operators must filter by team, status, priority, and assignee, as well as perform fast keyword searches across titles and descriptions.

### Options Considered
1. **Client-Side Filtering**: Download all items to the browser and perform JavaScript `.filter()` and pagination.
2. **Offset-Based SQL Pagination (`OFFSET N LIMIT 20`)**: Traditional pagination using SQL `OFFSET`.
3. **Server-Side ILIKE Filtering with Keyset / Cursor Pagination (`(created_at, id) < (cursorTime, cursorId)`)**:
   - Server applies all filters (`status`, `priority`, `team_id IN (...)`, `assignee_id`).
   - Keyword search executes server-side via `(title ILIKE $q OR description ILIKE $q)`.
   - Pagination operates on a deterministic cursor tuple `created_at:::id` encoded in Base64.

### Choice
**Option 3: Server-Side Filters + Keyset/Cursor-Based Pagination.**
- Offset pagination degrades to $O(N)$ table scans at deep pages (e.g. `OFFSET 2800`), causing severe lock contention and slow queries under load.
- Keyset cursor pagination utilizes the composite index `(created_at DESC, id DESC)`, remaining constant $O(\log N)$ regardless of page depth.
- Prevents "page drift" where newly inserted urgent items cause rows to shift between pages during active operations.

### Trade-offs
- **Pros**: Instant page loads even with millions of records; zero page drift under heavy concurrent inserts; low memory footprint on client browsers.
- **Cons**: Cannot jump to an arbitrary page number (e.g. "jump to page 47") without forward traversal; requires cursor encoding/decoding logic on client and server.
