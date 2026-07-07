-- Justmailit — Supabase/Postgres schema
-- Each collection is stored as one table: an integer id (app-assigned) + a JSONB blob
-- holding the full record. This mirrors the app's existing dynamic object shapes
-- (many routes do `{ id, ...req.body }`) without requiring a rigid column-per-field
-- schema that would silently drop fields the app adds later.
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).
-- Required: the app talks to Supabase over its REST API, which can't run CREATE TABLE,
-- so this step has to happen here first.

CREATE TABLE IF NOT EXISTS users (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users ((lower(data->>'email')));

CREATE TABLE IF NOT EXISTS reset_tokens (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS reset_tokens_token_idx ON reset_tokens ((data->>'token'));

CREATE TABLE IF NOT EXISTS verification_tokens (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_tokens_token_idx ON verification_tokens ((data->>'token'));

CREATE TABLE IF NOT EXISTS email_accounts (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts ((lower(data->>'email')));

CREATE TABLE IF NOT EXISTS templates (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_idx ON campaign_recipients (((data->>'campaignId')::int));

CREATE TABLE IF NOT EXISTS automations (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_enrollments (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS automation_enrollments_automation_idx ON automation_enrollments (((data->>'automationId')::int));

CREATE TABLE IF NOT EXISTS inbox_threads (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (((data->>'userId')::int));

-- Workspaces: a user can belong to (own or be a member of) multiple workspaces.
-- Every resource table above gets scoped by (data->>'workspaceId') going forward.
CREATE TABLE IF NOT EXISTS workspaces (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON workspace_members (((data->>'workspaceId')::int));
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (((data->>'userId')::int));

CREATE TABLE IF NOT EXISTS workspace_invites (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_invites_token_idx ON workspace_invites ((data->>'token'));
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON workspace_invites ((lower(data->>'email')));

-- Forms & landing pages: public-facing lead capture. Forms are embeddable
-- (iframe) or used inside a landing page; landing pages are standalone hosted
-- pages at /lp/:slug, so slug must be globally unique across all workspaces.
CREATE TABLE IF NOT EXISTS forms (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS forms_workspace_idx ON forms (((data->>'workspaceId')::int));

CREATE TABLE IF NOT EXISTS landing_pages (
  id   INTEGER PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS landing_pages_workspace_idx ON landing_pages (((data->>'workspaceId')::int));
CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_slug_idx ON landing_pages ((lower(data->>'slug')));
