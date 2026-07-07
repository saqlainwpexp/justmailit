/**
 * One-time migration: reads the local lowdb JSON file (data/db.json) and writes
 * every record into Supabase via the same adapter the server uses.
 *
 * Usage:
 *   SUPABASE_URL="https://xxxxx.supabase.co" SUPABASE_SERVICE_KEY="sb_secret_..." node scripts/migrate-to-supabase.mjs
 *
 * Requires supabase_schema.sql to have already been run in the Supabase SQL Editor
 * (PostgREST can't create tables, so this doesn't happen automatically).
 */
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { SupabaseAdapter } from '../db-adapter.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.')
    process.exit(1)
  }

  const localPath = join(__dirname, '..', 'data', 'db.json')
  const localDb = new Low(new JSONFile(localPath), {})
  await localDb.read()
  if (!localDb.data || Object.keys(localDb.data).length === 0) {
    console.error(`No local data found at ${localPath} — nothing to migrate.`)
    process.exit(1)
  }

  console.log('Local data summary:')
  for (const [key, val] of Object.entries(localDb.data)) {
    console.log(`  ${key}: ${Array.isArray(val) ? val.length : '?'} records`)
  }

  console.log('\nConnecting to Supabase...')
  const adapter = new SupabaseAdapter(url, key)

  console.log('Writing all records to Supabase (this treats everything as new since Supabase starts empty)...')
  await adapter.write(localDb.data)

  console.log('\nMigration complete. Verifying by reading back...')
  const verify = await adapter.read()
  for (const [key, val] of Object.entries(verify)) {
    console.log(`  ${key}: ${val.length} records in Supabase`)
  }

  console.log('\nDone. You can now deploy with SUPABASE_URL + SUPABASE_SERVICE_KEY set and remove data/db.json from future deploy archives.')
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1) })
