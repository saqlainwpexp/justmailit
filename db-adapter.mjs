/**
 * Custom lowdb adapter backed by Supabase (via its REST API) instead of a local JSON file.
 *
 * Why REST (@supabase/supabase-js) instead of a raw Postgres connection: this app runs on
 * Hostinger shared hosting behind Phusion Passenger, where we already found direct/exotic
 * network paths get blocked (multipart uploads were blocked by their CDN, forcing a TUS
 * workaround). HTTPS to Supabase's REST endpoint is the same protocol the site itself is
 * served over, so it's the reliable choice here versus a raw TCP connection on a
 * non-standard port that may or may not be allowed outbound.
 *
 * Why this shape (one row per record, JSONB blob) instead of a normalized SQL schema:
 * the app builds records dynamically (`{ id, ...req.body }`, `Object.assign(x, req.body)`)
 * across contacts, campaigns, automations, etc. A rigid column-per-field schema would
 * silently drop any field the app writes that isn't in the schema. JSONB keeps every
 * field, gives real durable Postgres tables you can browse in Supabase, and needs zero
 * changes to route logic — only this adapter swaps out.
 *
 * Why diffing instead of full-table dump on every write(): several routes call
 * `db.write()` inside loops (campaign sending iterates recipients one at a time,
 * IMAP sync, the automation engine tick). A naive delete-all+reinsert per write would
 * rewrite the entire table on every iteration. Diffing against the last known snapshot
 * means only actually-changed rows get upserted.
 *
 * Tradeoff vs. a raw DB connection: PostgREST calls aren't wrapped in a single cross-table
 * transaction, so if a write touches multiple tables and one REST call fails partway
 * through, earlier tables in that write() call have already committed. In practice nearly
 * every route mutates one collection per request, so this is a narrow, low-probability gap
 * — noted here rather than hidden.
 *
 * Requires the tables to already exist (see supabase_schema.sql) — PostgREST can't run
 * CREATE TABLE, so that one-time setup step happens in the Supabase SQL Editor.
 */

import { createClient } from '@supabase/supabase-js'

const TABLES = {
  users:                 'users',
  resetTokens:           'reset_tokens',
  verificationTokens:    'verification_tokens',
  emailAccounts:         'email_accounts',
  domains:               'domains',
  contacts:              'contacts',
  templates:             'templates',
  campaigns:             'campaigns',
  campaignRecipients:    'campaign_recipients',
  automations:           'automations',
  automationEnrollments: 'automation_enrollments',
  inboxThreads:          'inbox_threads',
  notifications:         'notifications',
  apiKeys:               'api_keys',
  workspaces:            'workspaces',
  workspaceMembers:      'workspace_members',
  workspaceInvites:      'workspace_invites',
  forms:                 'forms',
  landingPages:          'landing_pages',
  segments:              'segments',
  transactionalEmails:   'transactional_emails',
  referrals:             'referrals',
}

const CHUNK_SIZE = 500 // rows per upsert/delete batch

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export class SupabaseAdapter {
  constructor(url, serviceKey) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } })
    this._snapshot = {} // collectionKey -> Map(id -> JSON string of last-persisted row)
  }

  async read() {
    const data = {}
    await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
      const { data: rows, error } = await this.client.from(table).select('id,data').order('id', { ascending: true })
      if (error) throw new Error(`Supabase read failed for "${table}": ${error.message}`)
      data[key] = rows.map(r => r.data)
      this._snapshot[key] = new Map(data[key].map(row => [row.id, JSON.stringify(row)]))
    }))
    return data
  }

  async write(data) {
    for (const [key, table] of Object.entries(TABLES)) {
      const rows    = data[key] || []
      const prevMap = this._snapshot[key] || new Map()
      const nextMap = new Map()
      const toUpsert = []

      for (const row of rows) {
        const json = JSON.stringify(row)
        nextMap.set(row.id, json)
        if (prevMap.get(row.id) !== json) toUpsert.push({ id: row.id, data: row })
      }
      const toDelete = [...prevMap.keys()].filter(id => !nextMap.has(id))

      for (const batch of chunk(toUpsert, CHUNK_SIZE)) {
        const { error } = await this.client.from(table).upsert(batch, { onConflict: 'id' })
        if (error) throw new Error(`Supabase upsert failed for "${table}": ${error.message}`)
      }
      for (const batch of chunk(toDelete, CHUNK_SIZE)) {
        const { error } = await this.client.from(table).delete().in('id', batch)
        if (error) throw new Error(`Supabase delete failed for "${table}": ${error.message}`)
      }

      this._snapshot[key] = nextMap
    }
  }
}
