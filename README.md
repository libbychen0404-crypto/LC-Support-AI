# LC AI Support

LC AI Support is a case-driven Next.js customer support prototype for router-related issues. It behaves like a support workspace rather than a generic chatbot: the app greets the customer, classifies the issue in code, collects only the next required detail, shows a draft confirmation card, saves the customer and case in Supabase, resumes unfinished work when the customer returns, and now includes agent-side support operations.

## Project Overview

- Built with Next.js App Router and TypeScript.
- Uses Supabase for persistence.
- Preserves a three-layer support model:
  - customer profile
  - case record
  - collected fields
- Adds support-operations fields on each case:
  - `assigned_to`
  - `priority`
  - `eta_or_expected_update_time`
  - `internal_note`
  - `resolution_note`
  - `case_note`
  - `customer_update`
- Adds human-handoff and escalation fields:
  - `escalation_state`
  - `handoff_status`
  - `assigned_human_agent`
  - `handoff_requested_at`
  - `handoff_contact_method`
  - `handoff_callback_window`
  - `handoff_urgency_reason`
  - `handoff_additional_details`
- Keeps workflow decisions deterministic in `lib/caseLogic.ts`.
- Uses the OpenAI Responses API only for natural support wording, summaries, and note compression.
- Includes automated workflow tests, support-workspace API route tests, and Supabase adapter mapping tests with Vitest.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required variables for the current app:

- `SUPABASE_URL`: your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: server-side key used by the App Router API routes
- `SUPABASE_ANON_KEY`: required for user-scoped Supabase execution under customer/agent sessions
- `AUTH_SESSION_SECRET`: required to sign and verify the app-layer auth session cookie
- `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD`: required if you want the homepage demo customer entry flow
- `DEMO_AGENT_EMAIL` / `DEMO_AGENT_PASSWORD`: required if you want the homepage demo agent entry flow

Optional:

- `OPENAI_API_KEY`: enables live OpenAI wording and case-insight generation
- `OPENAI_MODEL`: defaults to `gpt-5-mini`

## Supabase Schema

Apply the SQL migration in [supabase/migrations/0001_support_workspace.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0001_support_workspace.sql) inside Supabase SQL Editor or through the Supabase CLI.

For the current app, the safest path is to apply **all migrations in order**:

1. [supabase/migrations/0001_support_workspace.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0001_support_workspace.sql)
2. [supabase/migrations/0002_upgrade_existing_support_tables.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0002_upgrade_existing_support_tables.sql)
3. [supabase/migrations/0003_cleanup_support_schema.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0003_cleanup_support_schema.sql)
4. [supabase/migrations/0004_support_ops_upgrade.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0004_support_ops_upgrade.sql)
5. [supabase/migrations/0005_handoff_support_upgrade.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0005_handoff_support_upgrade.sql)
6. [supabase/migrations/0006_identity_mapping_foundation.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0006_identity_mapping_foundation.sql)
7. [supabase/migrations/0007_rls_policy_foundation.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0007_rls_policy_foundation.sql)
8. [supabase/migrations/0008_audit_log_foundation.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0008_audit_log_foundation.sql)
9. [supabase/migrations/0009_customer_rls_completion.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0009_customer_rls_completion.sql)
10. [supabase/migrations/0010_archive_foundation.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0010_archive_foundation.sql)

`0003` removes the legacy `case_type` column, `0004` adds the richer support-operations fields used by the admin panel and case history views, `0005` adds the escalation and human handoff workflow fields, `0006` adds the `app_users` identity mapping layer, `0007` enables Row Level Security with the initial customer/agent policy foundation, `0008` adds the append-only audit log table and indexes, `0009` completes the customer-side RLS behavior needed by the current workflow, and `0010` adds the archive-state foundation used by hot-vs-archived case queries.

The schema creates:

- `customers`
- `cases`
- `collected_fields`

It supports one customer having multiple historical cases while preserving the current behavior of resuming the latest open case.

The audit foundation adds:

- `audit_logs`

It is append-only in design and stores structured snapshots with JSONB fields so later milestones can log status changes, handoffs, internal-note edits, and other operational actions without constant schema changes.

## Audit Verification

Milestone 3 depends on:

1. [supabase/migrations/0008_audit_log_foundation.sql](/Users/libbyc/Desktop/lc-ai-support-full/supabase/migrations/0008_audit_log_foundation.sql)
2. the existing customer/admin/system audit integration in `lib/supportService.ts`

If `0008` is not applied, the app will still work because audit writes are intentionally non-blocking, but no real audit rows will persist in Supabase.

You can verify audit readiness in two places:

- `/setup`
  - `audit_logs table`
- Supabase SQL Editor

Recommended demo verification flow:

1. Sign in as customer from `/`
2. Send an issue description so the case is classified
3. Continue field collection
4. Confirm or correct the draft case
5. Request human handoff
6. Sign in as agent
7. Take over the case
8. Change status / priority / internal note

After that, run:

```sql
select action_type, actor_type, source, case_id, customer_id, created_at
from public.audit_logs
order by created_at desc
limit 50;
```

Expected event coverage during a normal demo:

- customer-side
  - `case_created`
  - `customer_message_sent`
  - `customer_field_collected`
  - `customer_case_confirmed`
  - `customer_case_correction_requested`
  - `customer_handoff_requested`
- admin-side
  - `agent_case_assigned`
  - `agent_case_taken_over`
  - `agent_status_changed`
  - `agent_priority_changed`
  - `agent_internal_note_added`
  - `agent_internal_note_updated`
  - `agent_resolution_note_added`
  - `agent_customer_update_changed`
  - `agent_handoff_status_changed`
  - `agent_escalation_changed`
- system-side
  - `system_case_classified`
  - `system_stage_transitioned`
  - `system_status_transitioned`
  - `system_summary_updated`
  - `system_next_action_updated`
  - `system_ai_case_note_generated`
  - `system_handoff_state_initialized`

Still intentionally out of scope after Milestone 3:

- audit viewer UI
- retention/archive
- notifications

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Add your Supabase and OpenAI values to `.env.local`.

3. Start the app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

If you want to enter through the homepage demo buttons, also seed:

- one Supabase Auth customer user mapped in `app_users`
- one Supabase Auth agent user mapped in `app_users`
- matching demo credentials in `.env.local`

### Demo sign-in setup

The homepage demo entry buttons require all of the following:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `AUTH_SESSION_SECRET`
- `DEMO_CUSTOMER_EMAIL`
- `DEMO_CUSTOMER_PASSWORD`
- `DEMO_AGENT_EMAIL`
- `DEMO_AGENT_PASSWORD`

They also require:

- the `0006_identity_mapping_foundation.sql` migration
- the `0007_rls_policy_foundation.sql` migration
- one Supabase Auth customer demo user
- one Supabase Auth agent demo user
- matching active `app_users` mappings

If any of these are missing, the homepage demo entry will redirect back home with a clean error state instead of opening `/chat` or `/admin`.

Useful routes:

- `/chat`: customer-facing support workspace
- `/admin`: agent/admin support operations panel
- `/human-support`: customer-facing human handoff page tied to the active case
- `/setup`: schema and environment diagnostics

## Deployment (GitHub + Vercel)

This project is structurally ready for Vercel:

- Next.js App Router
- server-side API routes
- Supabase as the backend
- cookie-based app session plus Supabase access-token cookie
- no required localhost-only runtime dependency in the app code

### Before deploying

1. Make sure your Supabase project has the full schema for the current app by applying:
   - `0001` through `0010`
2. Make sure your demo users exist in Supabase Auth:
   - one demo customer
   - one demo agent
3. Make sure `app_users` contains active mappings for both demo users.

### Required Vercel environment variables

Set these in Vercel for **Production** and **Preview**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `AUTH_SESSION_SECRET`
- `DEMO_CUSTOMER_EMAIL`
- `DEMO_CUSTOMER_PASSWORD`
- `DEMO_AGENT_EMAIL`
- `DEMO_AGENT_PASSWORD`

Optional:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Deploy using GitHub

1. Push this project to a GitHub repository.
2. In Vercel, click **Add New Project**.
3. Import the GitHub repository.
4. Keep the default detected Next.js build settings.
5. Add the environment variables listed above.
6. Trigger the first deployment.

### Verify the public deployment

After deploy, open:

- `/`
- `/setup`
- `/chat` via `Continue as Customer`
- `/admin` via `Continue as Agent`

Expected checks:

- homepage loads
- `/setup` shows env + schema readiness
- demo customer sign-in reaches `/chat`
- demo agent sign-in reaches `/admin`
- customer/admin flows can read and write Supabase-backed case data

### Notes

- In production, the auth cookies automatically use the `Secure` flag.
- Audit persistence requires `0008` to be applied.
- Archive-aware hot-case filtering requires `0010` to be applied.

## Running Tests

Run the workflow tests:

```bash
npm run test
```

## Running Checks

Type check:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

## How The Workflow Works

1. The chat workspace loads a customer by external customer ID through the support workspace API route.
2. The storage service loads or creates the customer profile in Supabase.
3. The same service resumes the current open case for that customer or creates a fresh draft case if none is open.
4. The workspace now preserves the full customer case list, sorted by `updated_at`, so open and historical cases can be browsed in a lightweight support portal.
5. `lib/caseLogic.ts` controls greeting, issue discovery, deterministic classification, field collection, confirmation, case progression, and status changes.
6. Workflow status and escalation are now separate concepts:
   - workflow status: `New`, `Investigating`, `Waiting on Customer`, `Pending Technician`, `Provisioning Check`, `Replacement Review`, `Pending Follow-up`, `Resolved`, `Closed`
   - escalation state: `Normal` or `Escalated`
7. Once a case becomes `Escalated`, later technical troubleshooting does not silently clear that signal. It remains visible until a deliberate admin action, resolution, or closure changes it.
8. Human handoff is also deterministic in code and moves through `Not Requested`, `Awaiting Human Review`, `Human Assigned`, `Under Human Review`, and `Completed`.
9. Agent operations such as assignment, priority changes, ETA updates, internal notes, human takeover, and closing a case are handled in code through `lib/supportService.ts`.
10. AI wording and summaries are generated through `app/api/ai-reply/route.ts` and `app/api/ai-case-insights/route.ts`, with deterministic fallback behavior if AI is unavailable.

## Admin Panel

- `/admin` shows all saved customers, the current open-case queue, and an agent form for operational updates.
- Internal notes and case notes are editable only in the admin view and do not appear in the customer-facing workspace.
- The admin status selector now only shows valid next statuses for the selected case, so the UI matches the backend transition rules.
- Agents can change workflow status, set priority, assign ownership, set an ETA, manage escalation, take over a case as a human specialist, publish a customer-facing update, and close a case with a resolution note.

## Handoff Workflow

- Customers can request human help from the main case workspace or from `/human-support`.
- A handoff request captures:
  - preferred contact method
  - callback time window
  - urgency reason
  - additional details
- The handoff is stored on the case, added to the timeline, and reflected in both customer and admin views.
- If a handoff already exists, the customer sees the existing request status instead of creating a duplicate.
- When an admin takes over the case, the conversation records a `Human Support Agent` message so the mixed AI + human support flow stays believable in demos.

## Message Rendering

- `customer` messages render as `Customer`
- `ai` messages render as `LC Support AI`
- `agent` messages render as `Human Support Agent`, or the saved agent label if one is present
- This keeps AI and human participation visually distinct in the same case thread

## Setup Check

- `/setup` checks whether:
  - required environment variables are present
  - the `customers`, `cases`, and `collected_fields` tables match the expected schema
  - the `app_users` identity foundation exists
  - Row Level Security is enabled on the support tables
  - the legacy `case_type` column has been removed
- Use this page when the workspace fails to load and you need a more explicit diagnosis than a generic API error.

## Milestone 2 Execution Model

Milestone 2 moves normal protected business flows onto user-scoped Supabase execution so Row Level Security protects real customer and agent data access at the database layer.

Routes that now use user-scoped execution:

- `/api/support-workspace`
  - `load`
  - `save`
  - `start-new`
  - `load-case`
- `/api/handoff`
- `/api/admin-support`

These routes now require all of the following to succeed:

- a valid signed-cookie app session
- a matching `app_users` mapping
- a valid Supabase user access token
- RLS enabled on the support tables

Intentional service-role flows that remain:

- `/api/setup-check`
  - schema, environment, and identity diagnostics need broad system visibility
- `app_users` identity lookup in `lib/appIdentity.ts`
  - this is still used as a controlled bootstrap/identity-resolution step before the app can create a user-scoped client
- support workspace `reset`
  - reset deletes and recreates the customer workspace, so it remains a tightly controlled destructive flow instead of a normal customer RLS write path

Expected failure modes after Milestone 2:

- `identity_mapping_missing`
  - signed-in user has no `app_users` row yet
- `identity_mapping_inactive`
  - mapping exists but is inactive
- `identity_mapping_invalid`
  - role or ownership mapping does not match the signed-in session
- `supabase_access_token_missing`
  - request is missing the Supabase user token
- `supabase_access_token_invalid`
  - token is malformed or expired
- `supabase_user_mismatch`
  - signed-cookie app session and Supabase user token belong to different users
- `forbidden`
  - app-layer or RLS-backed ownership/role checks rejected the operation

Manual verification checklist:

1. Customer route happy path
   - sign in as a mapped customer with a valid Supabase user token
   - open `/chat`
   - confirm workspace load/save/start-new/load-case work
2. Customer isolation
   - attempt forged `customerId` or another customer's `caseId`
   - confirm request fails with `403`
3. Handoff happy path
   - submit a handoff from `/human-support`
   - confirm the rightful customer can submit it and customer-safe DTOs still exclude internal-only fields
4. Admin happy path
   - sign in as a mapped agent with a valid Supabase user token
   - open `/admin`
   - confirm dashboard load, update, and take-over still work
5. Missing-prerequisite behavior
   - remove mapping or Supabase token
   - confirm routes fail clearly instead of silently falling back to unrestricted service-role access

## Key Files

- `app/api/support-workspace/route.ts`: server route for loading, saving, resetting, and starting new cases
- `app/api/admin-support/route.ts`: admin route for loading the support queue and updating operational fields
- `app/api/handoff/route.ts`: route for creating persisted human support requests tied to a case
- `app/api/setup-check/route.ts`: route for environment/schema diagnostics
- `app/api/ai-case-insights/route.ts`: server-only AI summary and case-note route
- `app/api/ai-reply/route.ts`: server-only OpenAI wording route
- `components/chat/*`: reusable customer-facing support workspace UI
- `components/admin/AdminWorkspace.tsx`: agent-side support operations panel
- `components/handoff/HumanSupportWorkspace.tsx`: customer-facing handoff request and status view
- `components/setup/SetupCheckPanel.tsx`: setup diagnostics UI
- `lib/caseLogic.ts`: deterministic support workflow logic
- `lib/caseStatus.ts`: allowed workflow transitions, customer-facing labels, and handoff expectations
- `lib/supportService.ts`: orchestration between workflow state and persistence
- `lib/storage.ts`: storage interface and persistence types
- `lib/storageSupabase.ts`: Supabase adapter
- `lib/storageMemory.ts`: in-memory fake adapter for tests
- `lib/customerFileClient.ts`: browser helper for the workspace API route
- `supabase/migrations/0004_support_ops_upgrade.sql`: support-operations schema upgrade
- `supabase/migrations/0005_handoff_support_upgrade.sql`: escalation and human handoff schema upgrade
- `tests/caseLogic.test.ts`: workflow state transition tests
- `tests/supportService.test.ts`: open-case resume behavior tests
- `tests/caseStatus.test.ts`: admin status transition exposure tests
- `tests/conversationPanel.test.ts`: mixed AI + human sender rendering test
- `tests/supportWorkspaceRoute.test.ts`: support workspace API route integration-style tests
- `tests/storageSupabase.test.ts`: Supabase adapter mapping tests
- `tests/ai.test.ts`: fallback-safe AI wording test

## Current Limitations

- The app still relies on the Milestone 1 signed-cookie auth layer plus a Supabase user token bridge; a full Supabase Auth-only cutover has not been done yet.
- Some controlled system/bootstrap operations still use the service-role path intentionally.
- Messages and timeline items are stored as JSON blobs on the case row for simplicity.
- The customer workspace focuses on one selected case at a time, even though full case history is preserved.
- Issue classification is intentionally narrow to router activation and router repair.
- The admin panel is intentionally lightweight and does not yet provide audit logs.

## Suggested Next Upgrades

- Add audit history for agent status changes and internal note edits.
- Add richer SLA / escalation rules and notification delivery.
- Add customer attachments and technician handoff workflows.
- Add richer reporting, filters, and queue management to the admin dashboard.
