/**
 * KeepMailing — full backend
 * Auth · Email Accounts · Domains · Contacts · Templates · Campaigns · Automations
 */

import express      from 'express'
import cors         from 'cors'
import cookieParser from 'cookie-parser'
import dotenv       from 'dotenv'
import { Low }      from 'lowdb'
import { JSONFile } from 'lowdb/node'
// SupabaseAdapter is loaded via dynamic import inside startup() — see note there.
import bcrypt       from 'bcryptjs'
import jwt          from 'jsonwebtoken'
import nodemailer   from 'nodemailer'
import crypto       from 'crypto'
import dns          from 'dns/promises'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs           from 'fs'
import multer       from 'multer'

dotenv.config()

// Safety net: this is a shared, multi-tenant server, so one bad request (a
// misconfigured SMTP connection throwing a raw socket error, say) should
// never take the whole process — and every other workspace's traffic — down
// with it. Log and keep running rather than crash.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (process kept alive):', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (process kept alive):', reason)
})

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const PORT       = parseInt(process.env.PORT || process.env.SERVER_PORT || '3001')
const FRONTEND   = process.env.FRONTEND_URL || 'http://localhost:5173'
const JWT_SECRET = process.env.JWT_SECRET || (()=>{
  if (process.env.NODE_ENV === 'production') console.warn('[SECURITY] JWT_SECRET env var not set — sessions will be invalidated on every restart. Set it in hPanel.')
  return crypto.randomBytes(48).toString('hex')
})()
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }

// ─── Database ──────────────────────────────────────────────────────────────────

// db is initialized inside startup() — Supabase's adapter is loaded via a dynamic
// import there (not a static top-level import) so that if loading it ever throws,
// the process can catch it, fall back to the local JSON store, and keep serving
// instead of crashing before app.listen() ever runs.
let db
let dbInitError = null

// Seed / migration constants (used inside startup())
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'saqlainwpexp@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@keepmailing2025!'

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Auto-increment per collection
const _ids = {}
function nextId(col) {
  if (!_ids[col]) _ids[col] = Math.max(0, ...db.data[col].map(r => r.id || 0)) + 1
  return _ids[col]++
}

// Rate limiters (login + forgot-password, both in-memory per IP)
const loginAttempts  = new Map()
const forgotAttempts = new Map()

function checkRateLimit(ip) {
  const e = loginAttempts.get(ip) || {}
  if (e.lockedUntil && Date.now() < e.lockedUntil)
    return { blocked: true, minsLeft: Math.ceil((e.lockedUntil - Date.now()) / 60000) }
  return { blocked: false }
}
function recordFail(ip) {
  const e = loginAttempts.get(ip) || { count: 0 }
  e.count = (e.count || 0) + 1
  if (e.count >= 5) { e.lockedUntil = Date.now() + 15 * 60000; e.count = 0 }
  loginAttempts.set(ip, e)
}
function clearAttempts(ip) { loginAttempts.delete(ip) }

function checkForgotRateLimit(ip) {
  const e = forgotAttempts.get(ip) || {}
  if (e.lockedUntil && Date.now() < e.lockedUntil) return true
  if ((e.count || 0) >= 5) {
    e.lockedUntil = Date.now() + 15 * 60000; e.count = 0
    forgotAttempts.set(ip, e); return true
  }
  e.count = (e.count || 0) + 1
  forgotAttempts.set(ip, e); return false
}

const registerAttempts = new Map()
function checkRegisterLimit(ip) {
  const e = registerAttempts.get(ip) || {}
  if (e.lockedUntil && Date.now() < e.lockedUntil) return true
  if ((e.count || 0) >= 10) {
    e.lockedUntil = Date.now() + 60 * 60000; e.count = 0
    registerAttempts.set(ip, e); return true
  }
  e.count = (e.count || 0) + 1
  registerAttempts.set(ip, e); return false
}

// JWT
function signToken(p)  { return jwt.sign(p, JWT_SECRET, { expiresIn: '30d' }) }
function verifyToken(t){ try { return jwt.verify(t, JWT_SECRET) } catch { return null } }

function requireAuth(req, res, next) {
  const p = verifyToken(req.cookies?.authToken)
  if (!p) return res.status(401).json({ error: 'Not authenticated' })
  const user = db.data.users.find(u => u.id === p.sub)
  if (!user) return res.status(401).json({ error: 'User not found' })
  req.user = user; next()
}

function requireOwner(req, res, next) {
  const p = verifyToken(req.cookies?.authToken)
  if (!p) return res.status(401).json({ error: 'Not authenticated' })
  const user = db.data.users.find(u => u.id === p.sub)
  if (!user) return res.status(401).json({ error: 'User not found' })
  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' })
  req.user = user; next()
}

// In-memory attachment uploads for compose/reply — files never touch disk and
// are discarded as soon as the send completes (or fails).
const uploadAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
})

// Make nodemailer transport from stored account config
function makeTransport(account) {
  return nodemailer.createTransport({
    host: account.smtpHost, port: account.smtpPort || 587,
    secure: account.smtpSecure || false,
    auth: { user: account.smtpUser, pass: account.smtpPass },
    connectionTimeout: 12000, greetingTimeout: 12000,
  })
}

// Send a transactional system email (verification, password reset, etc.)
// Uses SMTP env vars first, falls back to first configured email account in DB.
async function sendTransactionalEmail({ to, subject, html }) {
  let transport, from
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    const port = parseInt(process.env.SMTP_PORT || '587')
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 needs an implicit-TLS connection from the first byte; port
      // 587 starts plain and upgrades via STARTTLS. Getting this wrong (e.g.
      // connecting to 465 with secure:false) causes a raw TLS/socket error
      // that can crash the process instead of cleanly rejecting the promise.
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 12000, greetingTimeout: 12000,
    })
    from = process.env.SMTP_FROM || process.env.SMTP_USER
  } else {
    const account = db.data.emailAccounts.find(a => a.smtpHost && a.smtpUser && a.smtpPass)
    if (!account) throw new Error('No SMTP configured. Add an email account or set SMTP_HOST/USER/PASS env vars.')
    transport = makeTransport(account)
    from = account.fromName ? `${account.fromName} <${account.email}>` : account.email
  }
  await transport.sendMail({ from, to, subject, html })
}

// Fill merge tags
// Lazily assigns each contact a stable, unguessable token the first time an
// email actually needs an unsubscribe link — avoids exposing an incrementing
// contact id (or email in plaintext) in every outbound message.
function getOrCreateUnsubToken(contact) {
  if (!contact.unsubscribeToken) contact.unsubscribeToken = crypto.randomBytes(16).toString('hex')
  return contact.unsubscribeToken
}

function fillTags(html, contact, sender) {
  if (!html) return ''
  return html
    .replace(/\{\{first_name\}\}/gi,    contact.firstName || '')
    .replace(/\{\{last_name\}\}/gi,     contact.lastName  || '')
    .replace(/\{\{email\}\}/gi,         contact.email     || '')
    .replace(/\{\{company\}\}/gi,       contact.company   || '')
    .replace(/\{\{sender_name\}\}/gi,   sender?.fromName  || '')
    .replace(/\{\{sender_email\}\}/gi,  sender?.email     || '')
    .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }))
    .replace(/\{\{unsubscribe_link\}\}/gi, `${FRONTEND}/unsubscribe/${getOrCreateUnsubToken(contact)}`)
}

// Rewrite <a href> links to route through the click-tracking redirect, and append
// a 1x1 open-tracking pixel. Applied once, right before send, after merge tags are
// filled (so the original destination URLs are already resolved).
function addTracking(html, recId) {
  if (!html) return ''
  const withTrackedLinks = html.replace(/<a\s+([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi, (match, pre, quote, url, post) => {
    if (!/^https?:\/\//i.test(url)) return match // leave mailto:, tel:, #anchor, etc. untouched
    const tracked = `${FRONTEND}/track/click/${recId}?u=${encodeURIComponent(url)}`
    return `<a ${pre}href=${quote}${tracked}${quote}${post}>`
  })
  const pixel = `<img src="${FRONTEND}/track/open/${recId}" width="1" height="1" alt="" style="display:none;border:0" />`
  return /<\/body>/i.test(withTrackedLinks)
    ? withTrackedLinks.replace(/<\/body>/i, `${pixel}</body>`)
    : withTrackedLinks + pixel
}

// Push a real-time notification into the DB (kept to latest 100 per workspace)
function pushNotif(workspaceId, type, title, body, action = null) {
  if (!db.data.notifications) db.data.notifications = []
  const n = {
    id: nextId('notifications'), workspaceId,
    type, title, body, action,
    read: false,
    createdAt: new Date().toISOString(),
  }
  db.data.notifications.push(n)
  const forThisWorkspace = db.data.notifications.filter(x => x.workspaceId === workspaceId)
  if (forThisWorkspace.length > 100) {
    const toDrop = new Set(forThisWorkspace.slice(0, forThisWorkspace.length - 100).map(x => x.id))
    db.data.notifications = db.data.notifications.filter(x => !toDrop.has(x.id))
  }
  db.write().catch(console.error)
  return n
}

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLANS = {
  free_trial: { id:'free_trial', name:'Free Trial',         price:0,   interval:null,       trialDays:14, maxContacts:700,   maxEmailsPerMonth:4000  },
  pro:        { id:'pro',        name:'Pro',                 price:9,   interval:'monthly',  trialDays:null, maxContacts:3000,  maxEmailsPerMonth:10000 },
  max:        { id:'max',        name:'Max',                 price:49,  interval:'monthly',  trialDays:null, maxContacts:20000, maxEmailsPerMonth:20000 },
  agency:     { id:'agency',     name:'Agency / Enterprise', price:190, interval:'lifetime', trialDays:null, maxContacts:null,  maxEmailsPerMonth:null  },
}

// Plans belong to the workspace, not the user — a user can be an owner of a Pro
// workspace and a member of someone else's Free Trial workspace at the same time.
function getWorkspacePlan(workspace) {
  const key  = workspace.plan || 'free_trial'
  const plan = PLANS[key] || PLANS.free_trial
  if (key === 'free_trial') {
    const start    = new Date(workspace.trialStartedAt || workspace.createdAt || Date.now())
    const totalDays = plan.trialDays + (workspace.bonusTrialDays || 0)
    const end      = new Date(start.getTime() + totalDays * 86400000)
    const expired  = Date.now() > end.getTime()
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
    return { ...plan, expired, trialEnd: end.toISOString(), daysLeft }
  }
  return { ...plan, expired: false, trialEnd: null, daysLeft: null }
}

// Count emails delivered in the current billing cycle for a workspace
function getEmailsThisCycle(workspaceId) {
  const workspace = db.data.workspaces.find(w => w.id === workspaceId)
  if (!workspace) return 0
  const plan = getWorkspacePlan(workspace)
  if (!plan.maxEmailsPerMonth) return 0

  const anchor    = new Date(workspace.billingCycleStart || workspace.createdAt || Date.now())
  const anchorDay = anchor.getDate()
  const now       = new Date()
  let periodStart = new Date(now.getFullYear(), now.getMonth(), anchorDay)
  if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1)

  const wsCampaignIds = new Set(
    (db.data.campaigns || []).filter(c => c.workspaceId === workspaceId).map(c => c.id)
  )
  return (db.data.campaignRecipients || []).filter(r =>
    r.sentAt && wsCampaignIds.has(r.campaignId) && new Date(r.sentAt) >= periodStart
  ).length
}

// ─── Workspace resolution + plan enforcement middleware ───────────────────────

// Resolves which workspace the current request operates on: the user's
// activeWorkspaceId if they're still a member of it, else their first
// membership. Must run after requireAuth.
function requireWorkspace(req, res, next) {
  const memberships = db.data.workspaceMembers.filter(m => m.userId === req.user.id)
  if (!memberships.length) return res.status(403).json({ error: 'No workspace found for this account.' })
  let membership = memberships.find(m => m.workspaceId === req.user.activeWorkspaceId)
  if (!membership) membership = memberships[0]
  const workspace = db.data.workspaces.find(w => w.id === membership.workspaceId)
  if (!workspace) return res.status(404).json({ error: 'Workspace not found.' })
  req.workspace     = workspace
  req.workspaceRole = membership.role
  next()
}

function requireWorkspaceOwner(req, res, next) {
  requireWorkspace(req, res, () => {
    if (req.workspaceRole !== 'owner') return res.status(403).json({ error: 'Workspace owner access required.' })
    next()
  })
}

// Creates a workspace owned by `user`, adds the owner membership, and sets it
// as the user's active workspace. Used on registration, admin-created users,
// manual "new workspace" creation, and the startup migration for legacy users.
function createWorkspaceForUser(user, name) {
  const now = new Date().toISOString()
  const workspace = {
    id: nextId('workspaces'), name, ownerId: user.id,
    plan: 'free_trial', trialStartedAt: now, billingCycleStart: now, createdAt: now,
    bonusTrialDays: 0, referralCode: null,
  }
  db.data.workspaces.push(workspace)
  db.data.workspaceMembers.push({
    id: nextId('workspaceMembers'), workspaceId: workspace.id, userId: user.id,
    role: 'owner', joinedAt: now,
  })
  user.activeWorkspaceId = workspace.id
  return workspace
}

// Referral program: both sides get bonus free-trial days. Codes are generated
// lazily (first time a workspace's referral link is actually requested)
// rather than at workspace-creation time, since most workspaces never look.
const REFERRAL_BONUS_DAYS = 7

function getOrCreateReferralCode(workspace) {
  if (workspace.referralCode) return workspace.referralCode
  workspace.referralCode = crypto.randomBytes(4).toString('hex')
  return workspace.referralCode
}

function requirePlanActive(req, res, next) {
  const plan = getWorkspacePlan(req.workspace)
  if (plan.expired) {
    return res.status(403).json({
      error: 'Your free trial has expired. Please upgrade to continue.',
      code:  'TRIAL_EXPIRED',
    })
  }
  req.planInfo = plan
  next()
}

function checkContactLimit(req, res, next) {
  const plan = req.planInfo
  if (!plan.maxContacts) return next()
  const count = (db.data.contacts || []).filter(c => c.workspaceId === req.workspace.id).length
  if (count >= plan.maxContacts) {
    return res.status(403).json({
      error:   `Contact limit reached. Your ${plan.name} plan allows ${plan.maxContacts.toLocaleString()} contacts. Upgrade to add more.`,
      code:    'CONTACT_LIMIT',
      limit:   plan.maxContacts,
      current: count,
    })
  }
  next()
}

function checkEmailLimit(recipientCount, workspaceId, plan) {
  if (!plan.maxEmailsPerMonth) return null
  const used      = getEmailsThisCycle(workspaceId)
  const remaining = plan.maxEmailsPerMonth - used
  if (recipientCount > remaining) {
    return {
      error:     `Email limit reached. Your ${plan.name} plan allows ${plan.maxEmailsPerMonth.toLocaleString()} emails/month. You have ${Math.max(0,remaining).toLocaleString()} remaining this cycle. Upgrade for more.`,
      code:      'EMAIL_LIMIT',
      limit:     plan.maxEmailsPerMonth,
      used,
      remaining: Math.max(0, remaining),
    }
  }
  return null
}

// ─── Express app ───────────────────────────────────────────────────────────────

const app = express()
// /api/public/* is meant to be called from third-party sites embedding a form
// or landing page, so it needs any origin allowed. Everything else stays
// locked to FRONTEND. This has to be one CORS middleware (not one global +
// one on the public router) because the cors package ends OPTIONS preflight
// requests itself — a second, more permissive instance further down the
// chain would never be reached for preflight calls.
app.use(cors((req, callback) => {
  const isPublic = req.path.startsWith('/api/public')
  callback(null, isPublic ? { origin: true, credentials: false } : { origin: FRONTEND, credentials: true })
}))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

// Security headers
app.use((req, res, next) => {
  // /embed/* and /lp/* are meant to be iframed on third-party sites (embeddable
  // forms and standalone landing pages), so they need framing allowed from
  // anywhere. Everything else stays locked down to same-origin only.
  const isEmbeddable = req.path.startsWith('/embed') || req.path.startsWith('/lp')

  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!isEmbeddable) res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    isEmbeddable ? "frame-ancestors *" : "frame-ancestors 'none'",
  ].join('; '))
  if (process.env.NODE_ENV === 'production')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.removeHeader('X-Powered-By')
  next()
})

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

const authR = express.Router()

authR.post('/signin', async (req, res) => {
  const ip = req.ip || 'unknown'
  const lim = checkRateLimit(ip)
  if (lim.blocked) return res.status(429).json({ error: `Locked for ${lim.minsLeft} more minute(s).`, lockedMins: lim.minsLeft })
  const { email, password } = req.body
  const user = db.data.users.find(u => u.email.toLowerCase() === (email||'').trim().toLowerCase())
  const hash = user?.passwordHash || '$2a$12$placeholder0000000000000000000000000000000000000000000'
  const ok = await bcrypt.compare(password || '', hash)
  if (!user || !ok) { recordFail(ip); return res.status(401).json({ error: 'Invalid email or password.' }) }
  if (!user.emailVerified)
    return res.status(403).json({ error: 'Please verify your email before signing in. Check your inbox or request a new link.', code: 'EMAIL_NOT_VERIFIED' })
  clearAttempts(ip)
  res.cookie('authToken', signToken({ sub: user.id, email: user.email }), { ...COOKIE_OPTS, maxAge: 30*86400000 })
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

authR.get('/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user
  res.json({ user: { id, email, name, role } })
})

authR.post('/signout', (req, res) => {
  res.clearCookie('authToken', COOKIE_OPTS); res.json({ ok: true })
})

authR.post('/forgot-password', async (req, res) => {
  if (checkForgotRateLimit(req.ip || 'unknown'))
    return res.json({ message: 'If that account exists, a reset link was sent.' })
  res.json({ message: 'If that account exists, a reset link was sent.' })
  const user = db.data.users.find(u => u.email.toLowerCase() === (req.body.email||'').trim().toLowerCase())
  if (!user) return
  db.data.resetTokens = db.data.resetTokens.filter(t => t.userId !== user.id)
  const token = crypto.randomBytes(48).toString('hex')
  db.data.resetTokens.push({ id: nextId('resetTokens'), token, userId: user.id, expiresAt: Date.now()+3600000, used: false })
  await db.write()
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const t = nodemailer.createTransport({ host:process.env.SMTP_HOST, port:parseInt(process.env.SMTP_PORT||'587'), auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS} })
      await t.sendMail({ from:process.env.SMTP_FROM, to:user.email, subject:'Reset your KeepMailing password', html:`<p>Reset link (expires in 1 hour): <a href="${FRONTEND}/reset-password?token=${token}">Reset password</a></p>` })
    } catch(e) { console.warn('Reset email failed:', e.message) }
  }
})

authR.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  const rec = db.data.resetTokens.find(t => t.token===token && !t.used && Date.now()<t.expiresAt)
  if (!rec) return res.status(400).json({ error: 'Invalid or expired link.' })
  const user = db.data.users.find(u => u.id===rec.userId)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  user.passwordHash = await bcrypt.hash(password, 12); rec.used = true
  await db.write(); res.json({ ok: true })
})

authR.post('/register', async (req, res) => {
  if (checkRegisterLimit(req.ip || 'unknown'))
    return res.status(429).json({ error: 'Too many registrations from this address. Try again later.' })
  const { name, email, password, company, ref } = req.body
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required.' })
  if (typeof name !== 'string' || name.trim().length > 100)
    return res.status(400).json({ error: 'Invalid name.' })
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  const exists = db.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase())
  if (exists) return res.status(409).json({ error: 'An account with that email already exists.' })
  const passwordHash = await bcrypt.hash(password, 12)
  const now = new Date().toISOString()
  const user = {
    id: nextId('users'), email: email.trim().toLowerCase(), name: name.trim(),
    company: company?.trim?.() || '',
    passwordHash, role: 'user', createdAt: now, emailVerified: false,
  }
  db.data.users.push(user)
  const newWorkspace = createWorkspaceForUser(user, `${name.trim()}'s Workspace`)

  // Referral reward: both the new workspace and whoever referred them get
  // bonus trial days. Silently ignored if the code doesn't match anything —
  // an invalid ref shouldn't block registration.
  if (ref && typeof ref === 'string') {
    const referrerWorkspace = db.data.workspaces.find(w => w.referralCode === ref)
    if (referrerWorkspace) {
      referrerWorkspace.bonusTrialDays = (referrerWorkspace.bonusTrialDays || 0) + REFERRAL_BONUS_DAYS
      newWorkspace.bonusTrialDays = (newWorkspace.bonusTrialDays || 0) + REFERRAL_BONUS_DAYS
      db.data.referrals.push({
        id: nextId('referrals'), referrerWorkspaceId: referrerWorkspace.id,
        referredWorkspaceId: newWorkspace.id, referredEmail: user.email,
        bonusDays: REFERRAL_BONUS_DAYS, createdAt: now,
      })
      pushNotif(referrerWorkspace.id, 'system', 'Referral bonus earned!',
        `${user.name} signed up using your referral link — you both got ${REFERRAL_BONUS_DAYS} bonus trial days.`,
        { label: 'View referrals', href: '/settings' }
      )
    }
  }
  // Generate and store verification token
  const token = crypto.randomBytes(32).toString('hex')
  db.data.verificationTokens = (db.data.verificationTokens || []).filter(t => t.userId !== user.id)
  db.data.verificationTokens.push({ id: nextId('verificationTokens'), token, userId: user.id, expiresAt: Date.now() + 24 * 3600000 })
  await db.write()
  // Send verification email (best-effort — don't fail registration if email send fails)
  const siteUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : `${req.protocol}://${req.get('host')}`
  const verifyLink = `${siteUrl}/verify-email?token=${token}`
  sendTransactionalEmail({
    to: user.email,
    subject: 'Verify your KeepMailing account',
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 20px;color:#1a2e1a">
      <div style="text-align:center;margin-bottom:32px">
        <div style="display:inline-flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#2d5a3d;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">
            <span style="color:white;font-size:16px">✉</span>
          </div>
          <span style="font-size:18px;font-weight:700;color:#2d5a3d">KeepMailing</span>
        </div>
      </div>
      <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">Verify your email address</h2>
      <p style="color:#555;line-height:1.6;margin-bottom:24px">Hi ${user.name}, click the button below to verify your email and activate your account. The link expires in 24 hours.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${verifyLink}" style="background:#2d5a3d;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">Verify email address</a>
      </div>
      <p style="color:#999;font-size:12px;text-align:center">Or paste this link in your browser:<br><a href="${verifyLink}" style="color:#4a7c59;word-break:break-all">${verifyLink}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
      <p style="color:#bbb;font-size:11px;text-align:center">If you didn't create this account, you can ignore this email.</p>
    </body></html>`,
  }).catch(e => console.warn('Verification email failed:', e.message))
  res.status(201).json({ message: 'Account created. Please check your email to verify your account.' })
})

authR.get('/verify-email', async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Token required.' })
  const rec = (db.data.verificationTokens || []).find(t => t.token === token && Date.now() < t.expiresAt)
  if (!rec) return res.status(400).json({ error: 'This verification link is invalid or has expired.' })
  const user = db.data.users.find(u => u.id === rec.userId)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  user.emailVerified = true
  db.data.verificationTokens = db.data.verificationTokens.filter(t => t.token !== token)
  await db.write()
  res.cookie('authToken', signToken({ sub: user.id, email: user.email }), { ...COOKIE_OPTS, maxAge: 30*86400000 })
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

authR.post('/resend-verification', async (req, res) => {
  res.json({ message: 'If that account exists and is unverified, a new link was sent.' })
  const { email } = req.body
  const user = db.data.users.find(u => u.email.toLowerCase() === (email||'').trim().toLowerCase())
  if (!user || user.emailVerified) return
  const token = crypto.randomBytes(32).toString('hex')
  db.data.verificationTokens = (db.data.verificationTokens || []).filter(t => t.userId !== user.id)
  db.data.verificationTokens.push({ id: nextId('verificationTokens'), token, userId: user.id, expiresAt: Date.now() + 24 * 3600000 })
  await db.write()
  const siteUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : 'https://mediumblue-gull-474196.hostingersite.com'
  const verifyLink = `${siteUrl}/verify-email?token=${token}`
  sendTransactionalEmail({
    to: user.email,
    subject: 'Your new verification link — KeepMailing',
    html: `<p>Hi ${user.name},</p><p>Here's your new verification link (expires in 24 hours):</p><p><a href="${verifyLink}">${verifyLink}</a></p>`,
  }).catch(e => console.warn('Resend verification email failed:', e.message))
})

app.use('/api/auth', authR)

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

const adminR = express.Router()
adminR.use(requireOwner)

adminR.get('/stats', (_req, res) => {
  const users      = db.data.users.length
  const workspaces = db.data.workspaces.length
  const contacts   = db.data.contacts.length
  const campaigns  = db.data.campaigns.length
  const emailsSent = db.data.campaignRecipients.filter(r => r.status === 'sent' || r.status === 'opened' || r.status === 'clicked').length
  const plans = {}
  for (const w of db.data.workspaces) { const p = w.plan || 'free_trial'; plans[p] = (plans[p] || 0) + 1 }
  res.json({ users, workspaces, contacts, campaigns, emailsSent, plans })
})

adminR.get('/users', (_req, res) => {
  const users = db.data.users.map(u => {
    const workspaces = db.data.workspaceMembers.filter(m => m.userId === u.id).map(m => {
      const w = db.data.workspaces.find(w => w.id === m.workspaceId)
      if (!w) return null
      return {
        id: w.id, name: w.name, role: m.role, plan: w.plan || 'free_trial',
        contactCount:  db.data.contacts.filter(c => c.workspaceId === w.id).length,
        campaignCount: db.data.campaigns.filter(c => c.workspaceId === w.id).length,
      }
    }).filter(Boolean)
    const { passwordHash, ...safe } = u
    return { ...safe, workspaces }
  })
  res.json(users)
})

adminR.post('/users', async (req, res) => {
  const { name, email, password, plan, role } = req.body
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required.' })
  if (db.data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()))
    return res.status(409).json({ error: 'Email already in use.' })
  const now = new Date().toISOString()
  const user = {
    id: nextId('users'), email: email.trim().toLowerCase(), name: name.trim(),
    passwordHash: await bcrypt.hash(password, 12),
    role: role || 'user', createdAt: now, emailVerified: true,
  }
  db.data.users.push(user)
  const workspace = createWorkspaceForUser(user, `${name.trim()}'s Workspace`)
  if (plan && VALID_PLANS.has(plan)) workspace.plan = plan
  await db.write()
  const { passwordHash, ...safe } = user
  res.status(201).json({ ...safe, workspace: { id: workspace.id, name: workspace.name, plan: workspace.plan } })
})

const VALID_PLANS = new Set(['free_trial', 'pro', 'max', 'agency'])
const VALID_ROLES = new Set(['user', 'owner'])

adminR.patch('/users/:id', async (req, res) => {
  const id   = parseInt(req.params.id)
  const user = db.data.users.find(u => u.id === id)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  const { name, plan, role, password } = req.body
  if (name && typeof name === 'string') user.name = name.trim().slice(0, 100)
  if (plan) {
    if (!VALID_PLANS.has(plan)) return res.status(400).json({ error: `Invalid plan. Must be one of: ${[...VALID_PLANS].join(', ')}` })
    // Admin plan overrides apply to this user's first/primary workspace.
    const membership = db.data.workspaceMembers.find(m => m.userId === id)
    const workspace   = membership && db.data.workspaces.find(w => w.id === membership.workspaceId)
    if (workspace) workspace.plan = plan
  }
  if (role && req.user.id !== id) {
    if (!VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role.' })
    user.role = role
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    user.passwordHash = await bcrypt.hash(password, 12)
  }
  await db.write()
  const { passwordHash, ...safe } = user
  res.json(safe)
})

adminR.delete('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' })
  const idx = db.data.users.findIndex(u => u.id === id)
  if (idx === -1) return res.status(404).json({ error: 'User not found.' })
  db.data.users.splice(idx, 1)
  await db.write()
  res.json({ ok: true })
})

app.use('/api/admin', adminR)

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACES
// ═══════════════════════════════════════════════════════════════════════════════

const wsR = express.Router()
wsR.use(requireAuth)

wsR.get('/', (req, res) => {
  const memberships = db.data.workspaceMembers.filter(m => m.userId === req.user.id)
  const activeId = req.user.activeWorkspaceId || memberships[0]?.workspaceId
  const list = memberships.map(m => {
    const w = db.data.workspaces.find(w => w.id === m.workspaceId)
    if (!w) return null
    return { id: w.id, name: w.name, role: m.role, plan: w.plan || 'free_trial', isActive: w.id === activeId }
  }).filter(Boolean)
  res.json(list)
})

wsR.post('/', async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  const workspace = createWorkspaceForUser(req.user, name.trim())
  await db.write()
  res.status(201).json({ id: workspace.id, name: workspace.name, role: 'owner', plan: workspace.plan, isActive: true })
})

// Pending invites for the current user's email — declared before /:id routes
// since Express matches by path shape, but keeping literal-prefixed routes
// first avoids any ambiguity.
wsR.get('/invites/pending', (req, res) => {
  const invites = db.data.workspaceInvites.filter(i =>
    i.email === req.user.email.toLowerCase() && i.status === 'pending' && Date.now() < i.expiresAt
  )
  res.json(invites.map(i => {
    const w = db.data.workspaces.find(w => w.id === i.workspaceId)
    return { token: i.token, workspaceName: w?.name || '(deleted workspace)', invitedAt: i.createdAt }
  }))
})

wsR.post('/invites/:token/accept', async (req, res) => {
  const invite = db.data.workspaceInvites.find(i => i.token === req.params.token && i.status === 'pending')
  if (!invite || Date.now() > invite.expiresAt) return res.status(400).json({ error: 'This invite is invalid or has expired.' })
  if (invite.email !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'This invite was sent to a different email address.' })
  invite.status = 'accepted'
  if (!db.data.workspaceMembers.some(m => m.workspaceId === invite.workspaceId && m.userId === req.user.id)) {
    db.data.workspaceMembers.push({
      id: nextId('workspaceMembers'), workspaceId: invite.workspaceId, userId: req.user.id,
      role: 'member', joinedAt: new Date().toISOString(),
    })
  }
  req.user.activeWorkspaceId = invite.workspaceId
  await db.write()
  const w = db.data.workspaces.find(w => w.id === invite.workspaceId)
  res.json({ ok: true, workspaceId: invite.workspaceId, workspaceName: w?.name })
})

wsR.post('/invites/:token/decline', async (req, res) => {
  const invite = db.data.workspaceInvites.find(i => i.token === req.params.token && i.status === 'pending')
  if (!invite) return res.status(404).json({ error: 'Not found' })
  if (invite.email !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'This invite was sent to a different email address.' })
  invite.status = 'declined'
  await db.write()
  res.json({ ok: true })
})

wsR.post('/:id/switch', async (req, res) => {
  const id = parseInt(req.params.id)
  const member = db.data.workspaceMembers.find(m => m.workspaceId === id && m.userId === req.user.id)
  if (!member) return res.status(403).json({ error: 'You are not a member of this workspace.' })
  req.user.activeWorkspaceId = id
  await db.write()
  res.json({ ok: true })
})

wsR.patch('/:id', async (req, res) => {
  const id     = parseInt(req.params.id)
  const member = db.data.workspaceMembers.find(m => m.workspaceId === id && m.userId === req.user.id)
  if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Workspace owner access required.' })
  const workspace = db.data.workspaces.find(w => w.id === id)
  if (!workspace) return res.status(404).json({ error: 'Not found' })
  if (req.body.name?.trim()) workspace.name = req.body.name.trim().slice(0, 100)
  await db.write()
  res.json({ ok: true, name: workspace.name })
})

wsR.delete('/:id', async (req, res) => {
  const id     = parseInt(req.params.id)
  const member = db.data.workspaceMembers.find(m => m.workspaceId === id && m.userId === req.user.id)
  if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Workspace owner access required.' })
  const userWorkspaceCount = db.data.workspaceMembers.filter(m => m.userId === req.user.id).length
  if (userWorkspaceCount <= 1) return res.status(400).json({ error: 'Cannot delete your only workspace.' })

  // Cascade-delete everything scoped to this workspace.
  const campaignIds   = new Set(db.data.campaigns.filter(c => c.workspaceId === id).map(c => c.id))
  const automationIds = new Set(db.data.automations.filter(a => a.workspaceId === id).map(a => a.id))
  db.data.contacts               = db.data.contacts.filter(c => c.workspaceId !== id)
  db.data.campaigns              = db.data.campaigns.filter(c => c.workspaceId !== id)
  db.data.campaignRecipients     = db.data.campaignRecipients.filter(r => !campaignIds.has(r.campaignId))
  db.data.domains                = db.data.domains.filter(d => d.workspaceId !== id)
  db.data.emailAccounts          = db.data.emailAccounts.filter(a => a.workspaceId !== id)
  db.data.templates              = db.data.templates.filter(t => t.workspaceId !== id)
  db.data.automations            = db.data.automations.filter(a => a.workspaceId !== id)
  db.data.automationEnrollments  = db.data.automationEnrollments.filter(e => !automationIds.has(e.automationId))
  db.data.inboxThreads           = db.data.inboxThreads.filter(t => t.workspaceId !== id)
  db.data.notifications          = db.data.notifications.filter(n => n.workspaceId !== id)
  db.data.apiKeys                = db.data.apiKeys.filter(k => k.workspaceId !== id)
  db.data.workspaceMembers        = db.data.workspaceMembers.filter(m => m.workspaceId !== id)
  db.data.workspaceInvites         = db.data.workspaceInvites.filter(i => i.workspaceId !== id)
  db.data.workspaces              = db.data.workspaces.filter(w => w.id !== id)

  // If this was the requester's active workspace, switch them to another one.
  if (req.user.activeWorkspaceId === id) {
    const nextMembership = db.data.workspaceMembers.find(m => m.userId === req.user.id)
    req.user.activeWorkspaceId = nextMembership?.workspaceId || null
  }
  await db.write()
  res.json({ ok: true })
})

wsR.get('/:id/members', (req, res) => {
  const id = parseInt(req.params.id)
  const isMember = db.data.workspaceMembers.some(m => m.workspaceId === id && m.userId === req.user.id)
  if (!isMember) return res.status(403).json({ error: 'Not a member of this workspace.' })
  const members = db.data.workspaceMembers.filter(m => m.workspaceId === id).map(m => {
    const u = db.data.users.find(u => u.id === m.userId)
    return { userId: m.userId, name: u?.name || '(deleted user)', email: u?.email || '', role: m.role, joinedAt: m.joinedAt }
  })
  const pendingInvites = db.data.workspaceInvites
    .filter(i => i.workspaceId === id && i.status === 'pending' && Date.now() < i.expiresAt)
    .map(i => ({ email: i.email, invitedAt: i.createdAt }))
  res.json({ members, pendingInvites })
})

wsR.post('/:id/invite', async (req, res) => {
  const id     = parseInt(req.params.id)
  const member = db.data.workspaceMembers.find(m => m.workspaceId === id && m.userId === req.user.id)
  if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Workspace owner access required.' })
  const { email } = req.body
  if (!email?.trim()) return res.status(400).json({ error: 'email required' })
  const targetEmail = email.trim().toLowerCase()
  const workspace = db.data.workspaces.find(w => w.id === id)
  if (!workspace) return res.status(404).json({ error: 'Not found' })

  const existingUser = db.data.users.find(u => u.email.toLowerCase() === targetEmail)
  if (existingUser && db.data.workspaceMembers.some(m => m.workspaceId === id && m.userId === existingUser.id))
    return res.status(409).json({ error: 'That person is already a member of this workspace.' })
  if (db.data.workspaceInvites.some(i => i.workspaceId === id && i.email === targetEmail && i.status === 'pending'))
    return res.status(409).json({ error: 'An invite is already pending for that email.' })

  const token  = crypto.randomBytes(32).toString('hex')
  const invite = {
    id: nextId('workspaceInvites'), workspaceId: id, email: targetEmail,
    invitedByUserId: req.user.id, token, status: 'pending',
    createdAt: new Date().toISOString(), expiresAt: Date.now() + 7 * 86400000,
  }
  db.data.workspaceInvites.push(invite)
  await db.write()

  const siteUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : `${req.protocol}://${req.get('host')}`
  const link = `${siteUrl}/invites?token=${token}`
  sendTransactionalEmail({
    to: targetEmail,
    subject: `${req.user.name} invited you to join "${workspace.name}" on KeepMailing`,
    html: `<p>${req.user.name} (${req.user.email}) invited you to join the workspace "${workspace.name}" on KeepMailing.</p>
           <p><a href="${link}">${existingUser ? 'Accept invite' : 'Sign up and accept invite'}</a></p>
           <p style="color:#999;font-size:12px">This invite expires in 7 days.</p>`,
  }).catch(e => console.warn('Workspace invite email failed:', e.message))

  res.status(201).json({ ok: true, email: targetEmail })
})

wsR.delete('/:id/members/:userId', async (req, res) => {
  const id           = parseInt(req.params.id)
  const targetUserId = parseInt(req.params.userId)
  const requester    = db.data.workspaceMembers.find(m => m.workspaceId === id && m.userId === req.user.id)
  if (!requester || requester.role !== 'owner') return res.status(403).json({ error: 'Workspace owner access required.' })
  if (targetUserId === req.user.id) {
    const ownerCount = db.data.workspaceMembers.filter(m => m.workspaceId === id && m.role === 'owner').length
    if (ownerCount <= 1) return res.status(400).json({ error: 'Cannot remove the only owner — delete the workspace instead.' })
  }
  db.data.workspaceMembers = db.data.workspaceMembers.filter(m => !(m.workspaceId === id && m.userId === targetUserId))
  await db.write()
  res.json({ ok: true })
})

app.use('/api/workspaces', wsR)

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

const acctR = express.Router()
acctR.use(requireAuth, requireWorkspace)

acctR.get('/', (req, res) => {
  res.json(db.data.emailAccounts.filter(a => a.workspaceId === req.workspace.id).map(({ smtpPass, ...a }) => a))
})

acctR.post('/', async (req, res) => {
  const { name, email, fromName, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, dailyLimit, color, provider } = req.body
  if (!name || !email || !smtpHost || !smtpUser || !smtpPass)
    return res.status(400).json({ error: 'name, email, smtpHost, smtpUser, smtpPass required.' })
  const account = {
    id: nextId('emailAccounts'), workspaceId: req.workspace.id, name, email, fromName: fromName||name,
    smtpHost, smtpPort: smtpPort||587, smtpUser, smtpPass,
    smtpSecure: smtpSecure||false, dailyLimit: dailyLimit||500,
    sentToday: 0, totalSent: 0, opens: 0, clicks: 0, bounces: 0,
    status: 'pending', color: color||'#2d5a3d', provider: provider||'SMTP',
    createdAt: new Date().toISOString(),
  }
  db.data.emailAccounts.push(account)
  await db.write()
  const { smtpPass:_, ...safe } = account; res.json(safe)
})

acctR.put('/:id', async (req, res) => {
  const a = db.data.emailAccounts.find(a => a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  // Explicit allowlist — prevents overwriting internal counters (sentToday, totalSent, etc.)
  const { name, email, fromName, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, dailyLimit, color, provider } = req.body
  if (name      !== undefined) a.name       = name
  if (email     !== undefined) a.email      = email
  if (fromName  !== undefined) a.fromName   = fromName
  if (smtpHost  !== undefined) a.smtpHost   = smtpHost
  if (smtpPort  !== undefined) a.smtpPort   = smtpPort
  if (smtpUser  !== undefined) a.smtpUser   = smtpUser
  if (smtpSecure!== undefined) a.smtpSecure = smtpSecure
  if (dailyLimit!== undefined) a.dailyLimit = dailyLimit
  if (color     !== undefined) a.color      = color
  if (provider  !== undefined) a.provider   = provider
  if (smtpPass)                a.smtpPass   = smtpPass
  await db.write()
  const { smtpPass:_, ...safe } = a; res.json(safe)
})

acctR.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  db.data.emailAccounts = db.data.emailAccounts.filter(a => !(a.id===id && a.workspaceId===req.workspace.id))
  // Removing an account from KeepMailing should remove its synced copies of
  // messages too — this only touches our local mirror, never the real mailbox.
  db.data.inboxThreads = db.data.inboxThreads.filter(t => !(t.accountId===id && t.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok: true })
})

// Soft "disconnect": keeps the account record (and SMTP credentials) around,
// but stops auto-sync from touching it and clears out its previously-synced
// inbox threads from KeepMailing — the real mailbox on the provider is
// untouched. Reconnecting just flips it back to 'pending' so the next sync
// tick re-populates the inbox fresh.
acctR.post('/:id/disconnect', async (req, res) => {
  const id = parseInt(req.params.id)
  const a = db.data.emailAccounts.find(a => a.id===id && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  a.status = 'disconnected'
  db.data.inboxThreads = db.data.inboxThreads.filter(t => !(t.accountId===id && t.workspaceId===req.workspace.id))
  await db.write()
  res.json({ ok: true, status: a.status })
})

acctR.post('/:id/reconnect', async (req, res) => {
  const a = db.data.emailAccounts.find(a => a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  a.status = 'pending'
  await db.write()
  res.json({ ok: true, status: a.status })
})

function smtpErrorMessage(e, account) {
  const msg = (e.message || '').toLowerCase()
  const code = e.code || ''
  if (!account.smtpHost) return 'No SMTP host configured. Fill in the host field.'
  if (!account.smtpUser || !account.smtpPass) return 'SMTP username or password is missing.'
  if (code === 'ETIMEDOUT' || msg.includes('timeout') || msg.includes('timed out'))
    return `Connection timed out connecting to ${account.smtpHost}:${account.smtpPort}. Check the host/port and that outbound SMTP isn't blocked by your firewall.`
  if (code === 'ECONNREFUSED')
    return `Connection refused by ${account.smtpHost}:${account.smtpPort}. Check the port — Gmail uses 587 (TLS) or 465 (SSL).`
  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo'))
    return `Host "${account.smtpHost}" not found. Check the SMTP hostname is correct.`
  if (msg.includes('535') || msg.includes('invalid login') || msg.includes('authentication failed') || msg.includes('username and password not accepted'))
    return `Authentication failed. ${account.smtpHost.includes('gmail') ? 'Gmail requires an App Password — not your regular password. Go to myaccount.google.com → Security → 2-Step Verification → App passwords.' : 'Check your SMTP username and password.'}`
  if (msg.includes('certificate') || msg.includes('self signed') || msg.includes('ssl'))
    return `SSL/TLS error. Try toggling "Secure (SSL)" — port 465 needs SSL ON, port 587 needs SSL OFF.`
  if (msg.includes('534') || msg.includes('must authenticate'))
    return 'Gmail blocked the sign-in. You need an App Password, not your normal password. Enable 2FA first at myaccount.google.com → Security.'
  return e.message
}

acctR.post('/:id/test', async (req, res) => {
  const a = db.data.emailAccounts.find(a => a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  try {
    await makeTransport(a).verify()
    a.status = 'connected'; a.lastTestedAt = new Date().toISOString()
    await db.write(); res.json({ ok: true, message: 'SMTP connection verified! ✓' })
  } catch(e) {
    a.status = 'error'; await db.write()
    res.status(502).json({ ok: false, error: smtpErrorMessage(e, a) })
  }
})

app.use('/api/accounts', acctR)

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAINS
// ═══════════════════════════════════════════════════════════════════════════════

const domR = express.Router()
domR.use(requireAuth, requireWorkspace)

// Known SMTP providers — when a domain's mail is actually relayed through one of these,
// that provider signs DKIM itself with its own key (you can't supply a custom one), and
// has its own required SPF include. Our own self-generated DKIM key is never applied to
// outgoing mail (this app relays via nodemailer/SMTP, it doesn't sign messages itself),
// so presenting it as "the" DKIM record for a provider-relayed domain was actively
// misleading — this is what caused the reported Gmail bounce (SPF/DKIM both failed
// against Hostinger's real mail servers while our fabricated records showed "pass").
const PROVIDERS = [
  { match: /hostinger\.com$/i,            name: 'Hostinger',                  spfInclude: '_spf.mail.hostinger.com',  docsUrl: 'https://www.hostinger.com/support/1583673-what-is-the-spf-record-for-hostinger-email/' },
  { match: /gmail\.com$|google\.com$/i,    name: 'Google Workspace / Gmail',   spfInclude: '_spf.google.com',          docsUrl: 'https://support.google.com/a/answer/33786' },
  { match: /office365\.com$|outlook\.com$/i, name: 'Microsoft 365 / Outlook',  spfInclude: 'spf.protection.outlook.com', docsUrl: 'https://learn.microsoft.com/en-us/defender-office-365/email-authentication-spf-configure' },
  { match: /sendgrid\.net$/i,              name: 'SendGrid',                   spfInclude: 'sendgrid.net',              docsUrl: 'https://docs.sendgrid.com/ui/account-and-settings/spf' },
  { match: /mailgun\.org$/i,               name: 'Mailgun',                    spfInclude: 'mailgun.org',               docsUrl: 'https://documentation.mailgun.com/en/latest/user_manual.html#verifying-your-domain' },
  { match: /zoho\.com$/i,                  name: 'Zoho Mail',                  spfInclude: 'zoho.com',                  docsUrl: 'https://www.zoho.com/mail/help/adminconsole/spf-configuration.html' },
  { match: /amazonaws\.com$/i,             name: 'Amazon SES',                 spfInclude: 'amazonses.com',             docsUrl: 'https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-spf.html' },
]

function detectProvider(smtpHost) {
  if (!smtpHost) return null
  return PROVIDERS.find(p => p.match.test(smtpHost)) || null
}

// Find the SMTP provider actually used to send from this domain, based on any
// configured email account (within the same workspace) whose address belongs to it.
function findDomainProvider(domain, workspaceId) {
  const acct = db.data.emailAccounts.find(a =>
    a.workspaceId === workspaceId && a.email && a.email.toLowerCase().endsWith('@' + domain.toLowerCase())
  )
  return acct ? detectProvider(acct.smtpHost) : null
}

function buildDnsRecords(domain, publicKey, provider) {
  const pub = publicKey
    ? publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g,'').replace(/\s+/g,'')
    : 'ADD_YOUR_PUBLIC_KEY_HERE'

  const spf = provider
    ? { key:'spf', type:'TXT', name:domain, value:`v=spf1 include:${provider.spfInclude} ~all`,
        description:`Authorizes ${provider.name} (your configured sender) to send on behalf of your domain` }
    : { key:'spf', type:'TXT', name:domain, value:`v=spf1 mx a ~all`,
        description:'Generic SPF for a self-managed mail server. If you relay through a provider (Gmail, Hostinger, SendGrid, etc.), use their specific SPF include instead — add an email account on this domain and we\'ll detect it automatically.' }

  const dkim = provider
    ? { key:'dkim', type:'CNAME', name:'(managed by your provider)', value:`Get this from your ${provider.name} control panel`,
        description:`${provider.name} signs DKIM itself with its own key — you can't substitute a custom one. Check their DKIM setup docs.`,
        managedExternally: true, docsUrl: provider.docsUrl }
    : { key:'dkim', type:'TXT', name:`keepmailing._domainkey.${domain}`, value:`v=DKIM1; k=rsa; p=${pub}`,
        description:'Only works if your mail server supports signing outgoing mail with a custom DKIM key (e.g. a self-hosted mail server, or providers like Amazon SES/SendGrid that let you upload one). Consumer providers such as Gmail, Outlook, and Hostinger manage their own DKIM and will ignore this.' }

  const dmarc = { key:'dmarc', type:'TXT', name:`_dmarc.${domain}`, value:`v=DMARC1; p=none; rua=mailto:dmarc@${domain}`, description:'Policy for handling unauthenticated emails' }

  return [spf, dkim, dmarc]
}

async function checkDns(domain, provider) {
  const results = { spf:'pending', dkim:'pending', dmarc:'pending' }
  try {
    const r = await dns.resolveTxt(domain)
    const txt = r.flat()
    results.spf = provider
      ? txt.some(s => s.startsWith('v=spf1') && s.includes(provider.spfInclude)) ? 'pass' : 'fail'
      : txt.some(s => s.startsWith('v=spf1')) ? 'pass' : 'fail'
  } catch { results.spf = 'fail' }

  if (provider) {
    // DKIM is managed by the provider with a selector we don't control or know —
    // we can't meaningfully probe it, so don't claim pass/fail against our own guess.
    results.dkim = 'external'
  } else {
    try { const r = await dns.resolveTxt(`keepmailing._domainkey.${domain}`); results.dkim = r.flat().join('').includes('v=DKIM1') ? 'pass':'fail' } catch { results.dkim = 'fail' }
  }

  try { const r = await dns.resolveTxt(`_dmarc.${domain}`); results.dmarc = r.flat().some(s=>s.startsWith('v=DMARC1')) ? 'pass':'fail' } catch { results.dmarc = 'fail' }
  return results
}

domR.get('/', (req, res) => {
  res.json(db.data.domains.filter(d => d.workspaceId === req.workspace.id).map(({ dkimPrivateKey, ...d }) => ({
    ...d, provider: findDomainProvider(d.domain, req.workspace.id)?.name || null,
  })))
})

domR.post('/', async (req, res) => {
  const { domain } = req.body
  if (!domain) return res.status(400).json({ error: 'domain required' })
  if (db.data.domains.find(d=>d.domain===domain && d.workspaceId===req.workspace.id))
    return res.status(409).json({ error: 'Domain already added.' })
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type:'spki',  format:'pem' },
    privateKeyEncoding: { type:'pkcs8', format:'pem' },
  })
  const rec = {
    id: nextId('domains'), workspaceId: req.workspace.id, domain,
    dkimPrivateKey: privateKey, dkimPublicKey: publicKey,
    spfStatus:'pending', dkimStatus:'pending', dmarcStatus:'pending',
    expanded: true, createdAt: new Date().toISOString(), lastVerifiedAt: null,
  }
  db.data.domains.push(rec); await db.write()
  const { dkimPrivateKey:_, ...safe } = rec
  const provider = findDomainProvider(domain, req.workspace.id)
  res.json({ ...safe, provider: provider?.name || null, records: buildDnsRecords(domain, publicKey, provider) })
})

domR.delete('/:id', async (req, res) => {
  db.data.domains = db.data.domains.filter(d=>!(d.id===parseInt(req.params.id) && d.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok:true })
})

domR.post('/:id/verify', async (req, res) => {
  const d = db.data.domains.find(d=>d.id===parseInt(req.params.id) && d.workspaceId===req.workspace.id)
  if (!d) return res.status(404).json({ error:'Not found' })
  const provider = findDomainProvider(d.domain, req.workspace.id)
  const r = await checkDns(d.domain, provider)
  Object.assign(d, { spfStatus:r.spf, dkimStatus:r.dkim, dmarcStatus:r.dmarc, lastVerifiedAt:new Date().toISOString() })
  await db.write()
  const dkimOk = r.dkim === 'pass' || r.dkim === 'external'
  if (r.spf === 'pass' && dkimOk && r.dmarc === 'pass')
    pushNotif(req.workspace.id, 'system', 'Domain verified', `"${d.domain}" DNS records verified and ready to send.`, { label: 'View domain', href: '/domains' })
  res.json({ ok:true, ...r, provider: provider?.name || null })
})

domR.get('/:id/records', (req, res) => {
  const d = db.data.domains.find(d=>d.id===parseInt(req.params.id) && d.workspaceId===req.workspace.id)
  if (!d) return res.status(404).json({ error:'Not found' })
  const provider = findDomainProvider(d.domain, req.workspace.id)
  res.json(buildDnsRecords(d.domain, d.dkimPublicKey, provider))
})

app.use('/api/domains', domR)

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════════════════════════════════════

const ctcR = express.Router()
ctcR.use(requireAuth, requireWorkspace)

ctcR.get('/', (req, res) => {
  const { search='', status, tag, list, page='1', limit='100' } = req.query
  let c = db.data.contacts.filter(x => x.workspaceId === req.workspace.id)
  if (search) { const q=search.toLowerCase(); c=c.filter(x=>`${x.firstName} ${x.lastName} ${x.email} ${x.company}`.toLowerCase().includes(q)) }
  if (status) c=c.filter(x=>x.status===status)
  if (tag)    c=c.filter(x=>x.tags?.includes(tag))
  if (list)   c=c.filter(x=>x.lists?.includes(list))
  const total=c.length, p=parseInt(page), l=parseInt(limit)
  c=c.slice((p-1)*l, p*l)
  res.json({ contacts:c, total, page:p, pages:Math.ceil(total/l) })
})

ctcR.post('/', requirePlanActive, checkContactLimit, async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error:'email required' })
  if (db.data.contacts.find(c=>c.workspaceId===req.workspace.id && c.email.toLowerCase()===email.toLowerCase()))
    return res.status(409).json({ error:'Contact with this email already exists.' })
  const contact = {
    ...req.body,
    id:nextId('contacts'), workspaceId: req.workspace.id,
    email: email.toLowerCase().trim(),
    status: req.body.status||'subscribed',
    tags: req.body.tags||[], lists: req.body.lists||[],
    added: new Date().toISOString(), lastEmailed: null,
  }
  db.data.contacts.push(contact); await db.write()
  triggerAutomation(req.workspace.id, 'contact_added', contact).catch(()=>{})
  res.json(contact)
})

ctcR.put('/:id', async (req, res) => {
  const c = db.data.contacts.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  // Snapshot before the generic update so we can detect newly added tags/lists —
  // this is the only path the Contacts UI actually uses to tag/list contacts,
  // so automation triggers have to fire from here, not just the unused dedicated
  // /:id/tag endpoint.
  const prevTags  = [...(c.tags  || [])]
  const prevLists = [...(c.lists || [])]
  const { id: _id, workspaceId: _wsId, ...updates } = req.body
  Object.assign(c, updates)
  await db.write()
  res.json(c)
  const newTags  = (c.tags  || []).filter(t => !prevTags.includes(t))
  const newLists = (c.lists || []).filter(l => !prevLists.includes(l))
  for (const tag  of newTags)  triggerAutomation(req.workspace.id, 'tag_added',  c, tag).catch(()=>{})
  for (const list of newLists) triggerAutomation(req.workspace.id, 'list_added', c, list).catch(()=>{})
})

ctcR.delete('/:id', async (req, res) => {
  db.data.contacts = db.data.contacts.filter(c=>!(c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok:true })
})

// Full activity timeline for one contact — campaigns they were sent (with
// open/click/failure state) and automations they've been enrolled in. Used
// by the contact detail page's drill-down view.
ctcR.get('/:id/activity', (req, res) => {
  const id = parseInt(req.params.id)
  const contact = db.data.contacts.find(c => c.id === id && c.workspaceId === req.workspace.id)
  if (!contact) return res.status(404).json({ error: 'Not found' })

  const campaigns = db.data.campaignRecipients
    .filter(r => r.contactId === id && r.workspaceId === req.workspace.id)
    .map(r => {
      const camp = db.data.campaigns.find(c => c.id === r.campaignId)
      return {
        campaignId: r.campaignId, campaignName: camp?.name || '(deleted campaign)', subject: camp?.subject || '',
        sentAt: r.sentAt, openedAt: r.openedAt, clickedAt: r.clickedAt, failedAt: r.failedAt, variantId: r.variantId || null,
      }
    })
    .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0))

  const automations = db.data.automationEnrollments
    .filter(e => e.contactId === id && e.workspaceId === req.workspace.id)
    .map(e => {
      const auto = db.data.automations.find(a => a.id === e.automationId)
      return { automationId: e.automationId, automationName: auto?.name || '(deleted automation)', status: e.status, enrolledAt: e.enrolledAt }
    })
    .sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt))

  res.json({ contact, campaigns, automations })
})

ctcR.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body
  db.data.contacts = db.data.contacts.filter(c=>!(ids.includes(c.id) && c.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok:true, deleted:ids.length })
})

// Additive only — existing tags/lists on each contact are kept, these are
// merged in (not a replace), so running this twice with the same tag is safe.
ctcR.post('/bulk-tag', async (req, res) => {
  const { ids, addTags, addLists } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' })
  if (!addTags?.length && !addLists?.length) return res.status(400).json({ error: 'addTags or addLists required' })
  let updated = 0
  for (const c of db.data.contacts) {
    if (!ids.includes(c.id) || c.workspaceId !== req.workspace.id) continue
    for (const t of addTags || [])  if (!c.tags.includes(t))  c.tags.push(t)
    for (const l of addLists || []) if (!c.lists.includes(l)) c.lists.push(l)
    updated++
  }
  await db.write()
  res.json({ ok: true, updated })
})

// Proper RFC4180-ish CSV parser — handles quoted fields (with embedded commas,
// newlines, and escaped "" quotes) and both \n and \r\n line endings, unlike a
// naive split(',')/split('\n') which corrupts any field containing a comma.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') { if (s[i+1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''))
}

// Returns the CSV's column headers + a few sample rows so the frontend can
// show a field-mapping UI before committing to an import.
ctcR.post('/import/preview', (req, res) => {
  const { csv } = req.body
  if (!csv) return res.status(400).json({ error: 'csv required' })
  const rows = parseCsv(csv.trim())
  if (!rows.length) return res.status(400).json({ error: 'CSV appears to be empty.' })
  const [headers, ...dataRows] = rows
  res.json({ headers, sampleRows: dataRows.slice(0, 5), rowCount: dataRows.length })
})

// mapping: { email: 'CSV Header Name', firstName: '...', ... } — only the
// columns explicitly mapped get pulled into each contact; anything else in
// the CSV is ignored. Only rows with a valid, mapped email get imported.
ctcR.post('/import', requirePlanActive, async (req, res) => {
  const { csv, mapping } = req.body
  if (!csv) return res.status(400).json({ error: 'csv required' })
  if (!mapping?.email) return res.status(400).json({ error: 'You must map a column to Email.' })
  const rows = parseCsv(csv.trim())
  if (!rows.length) return res.status(400).json({ error: 'CSV appears to be empty.' })
  const [headers, ...dataRows] = rows
  const colIndex = name => headers.findIndex(h => h.trim().toLowerCase() === String(name).trim().toLowerCase())
  const idx = {
    email: colIndex(mapping.email),
    firstName: mapping.firstName ? colIndex(mapping.firstName) : -1,
    lastName:  mapping.lastName  ? colIndex(mapping.lastName)  : -1,
    company:   mapping.company   ? colIndex(mapping.company)   : -1,
    phone:     mapping.phone     ? colIndex(mapping.phone)     : -1,
    location:  mapping.location  ? colIndex(mapping.location)  : -1,
    website:   mapping.website   ? colIndex(mapping.website)   : -1,
    tags:      mapping.tags      ? colIndex(mapping.tags)      : -1,
    lists:     mapping.lists     ? colIndex(mapping.lists)     : -1,
    notes:     mapping.notes     ? colIndex(mapping.notes)     : -1,
  }
  if (idx.email === -1) return res.status(400).json({ error: 'Mapped Email column not found in this CSV.' })

  let added = 0, skipped = 0
  const plan = req.planInfo
  const currentCount = db.data.contacts.filter(c => c.workspaceId === req.workspace.id).length
  const get = (row, i) => (i >= 0 ? (row[i] || '').trim() : '')

  for (const row of dataRows) {
    const email = get(row, idx.email).toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue }
    if (db.data.contacts.find(c => c.workspaceId === req.workspace.id && c.email === email)) { skipped++; continue }
    if (plan.maxContacts && (currentCount + added) >= plan.maxContacts) { skipped++; continue }
    const tagsRaw = get(row, idx.tags)
    const listsRaw = get(row, idx.lists)
    db.data.contacts.push({
      id: nextId('contacts'), workspaceId: req.workspace.id, email,
      firstName: get(row, idx.firstName), lastName: get(row, idx.lastName),
      company: get(row, idx.company), phone: get(row, idx.phone),
      location: get(row, idx.location), website: get(row, idx.website),
      tags:  tagsRaw  ? tagsRaw.split(';').map(t => t.trim()).filter(Boolean) : [],
      lists: listsRaw ? listsRaw.split(';').map(l => l.trim()).filter(Boolean) : [],
      notes: get(row, idx.notes), status: 'subscribed',
      added: new Date().toISOString(), lastEmailed: null,
    })
    added++
  }
  await db.write()
  res.json({ ok: true, added, skipped, total: dataRows.length })
})

// Export accepts optional filters — ids (explicit selection takes priority
// over everything else), tag, list, status, search — so "export selected" and
// "export this tag/list/filtered view" both just work instead of always
// dumping every contact in the workspace.
ctcR.get('/export', (req, res) => {
  const { ids, tag, list, status, search } = req.query
  let filtered = db.data.contacts.filter(c => c.workspaceId === req.workspace.id)
  if (ids) {
    const idSet = new Set(String(ids).split(',').map(s => parseInt(s)).filter(n => !isNaN(n)))
    filtered = filtered.filter(c => idSet.has(c.id))
  } else {
    if (tag)    filtered = filtered.filter(c => c.tags?.includes(tag))
    if (list)   filtered = filtered.filter(c => c.lists?.includes(list))
    if (status) filtered = filtered.filter(c => c.status === status)
    if (search) { const q = String(search).toLowerCase(); filtered = filtered.filter(c => `${c.firstName} ${c.lastName} ${c.email} ${c.company}`.toLowerCase().includes(q)) }
  }
  const cols = ['firstName','lastName','email','company','phone','location','website','status','tags','added']
  const header = cols.join(',')
  const rows = filtered.map(c=>cols.map(k=>`"${(Array.isArray(c[k])?c[k].join(';'):(c[k]||'')).toString().replace(/"/g,'""')}"`).join(','))
  res.setHeader('Content-Type','text/csv').setHeader('Content-Disposition','attachment; filename="contacts.csv"')
  res.send([header,...rows].join('\n'))
})

ctcR.post('/:id/tag', async (req, res) => {
  const c = db.data.contacts.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  const { tag } = req.body
  if (tag && !c.tags.includes(tag)) {
    c.tags.push(tag); await db.write()
    triggerAutomation(req.workspace.id, 'tag_added', c, tag).catch(()=>{})
  }
  res.json(c)
})

app.use('/api/contacts', ctcR)

// ═══════════════════════════════════════════════════════════════════════════════
// SEGMENTS — saved dynamic contact filters, re-evaluated live (not a snapshot)
// so a segment's membership always reflects current contact/engagement state.
// ═══════════════════════════════════════════════════════════════════════════════

function contactMatchesCondition(contact, cond, workspaceId) {
  const recipientsFor = () => db.data.campaignRecipients.filter(r => r.contactId === contact.id && r.workspaceId === workspaceId)
  const sinceMs = days => Date.now() - Number(days) * 86400000
  switch (cond.field) {
    case 'tag':                 return (contact.tags || []).includes(cond.value)
    case 'tag_not':              return !(contact.tags || []).includes(cond.value)
    case 'list':                 return (contact.lists || []).includes(cond.value)
    case 'list_not':              return !(contact.lists || []).includes(cond.value)
    case 'status':               return contact.status === cond.value
    case 'email_domain':         return contact.email.toLowerCase().endsWith('@' + String(cond.value).toLowerCase().replace(/^@/, ''))
    case 'company_contains':     return (contact.company || '').toLowerCase().includes(String(cond.value).toLowerCase())
    case 'added_within_days':    return new Date(contact.added).getTime() >= sinceMs(cond.value)
    case 'added_before_days':    return new Date(contact.added).getTime() < sinceMs(cond.value)
    case 'opened_within_days':   return recipientsFor().some(r => r.openedAt && new Date(r.openedAt).getTime() >= sinceMs(cond.value))
    case 'clicked_within_days':  return recipientsFor().some(r => r.clickedAt && new Date(r.clickedAt).getTime() >= sinceMs(cond.value))
    case 'never_opened':         { const r = recipientsFor(); return r.some(x => x.sentAt) && !r.some(x => x.openedAt) }
    case 'never_clicked':        { const r = recipientsFor(); return r.some(x => x.sentAt) && !r.some(x => x.clickedAt) }
    default: return true
  }
}

function evaluateSegment(contacts, conditions, matchType, workspaceId) {
  if (!conditions?.length) return contacts
  return contacts.filter(c => {
    const results = conditions.map(cond => contactMatchesCondition(c, cond, workspaceId))
    return matchType === 'any' ? results.some(Boolean) : results.every(Boolean)
  })
}

function segmentContacts(segment) {
  const contacts = db.data.contacts.filter(c => c.workspaceId === segment.workspaceId)
  return evaluateSegment(contacts, segment.conditions, segment.matchType, segment.workspaceId)
}

const segR = express.Router()
segR.use(requireAuth, requireWorkspace)

segR.get('/', (req, res) => {
  const segs = db.data.segments.filter(s => s.workspaceId === req.workspace.id)
  res.json(segs.map(s => ({ ...s, count: segmentContacts(s).length })))
})

segR.get('/:id', (req, res) => {
  const s = db.data.segments.find(s => s.id === parseInt(req.params.id) && s.workspaceId === req.workspace.id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  res.json({ ...s, count: segmentContacts(s).length })
})

// Live match count for a not-yet-saved condition set, so the segment builder
// UI can show "X contacts match" while the user is still editing.
segR.post('/preview', (req, res) => {
  const { conditions, matchType } = req.body
  const contacts = db.data.contacts.filter(c => c.workspaceId === req.workspace.id)
  const matched = evaluateSegment(contacts, conditions || [], matchType === 'any' ? 'any' : 'all', req.workspace.id)
  res.json({ count: matched.length })
})

segR.post('/', async (req, res) => {
  const { name, description, matchType, conditions } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  if (!Array.isArray(conditions) || !conditions.length) return res.status(400).json({ error: 'At least one condition is required.' })
  const seg = {
    id: nextId('segments'), workspaceId: req.workspace.id, name: name.trim(),
    description: description || '', matchType: matchType === 'any' ? 'any' : 'all',
    conditions,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  db.data.segments.push(seg); await db.write()
  res.status(201).json({ ...seg, count: segmentContacts(seg).length })
})

segR.put('/:id', async (req, res) => {
  const s = db.data.segments.find(s => s.id === parseInt(req.params.id) && s.workspaceId === req.workspace.id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  const { id: _id, workspaceId: _wsId, ...updates } = req.body
  Object.assign(s, updates, { updatedAt: new Date().toISOString() })
  await db.write()
  res.json({ ...s, count: segmentContacts(s).length })
})

segR.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  const s = db.data.segments.find(s => s.id === id && s.workspaceId === req.workspace.id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  db.data.segments = db.data.segments.filter(s => s.id !== id)
  await db.write()
  res.json({ ok: true })
})

app.use('/api/segments', segR)

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const tplR = express.Router()
tplR.use(requireAuth, requireWorkspace)

tplR.get('/',     (req,res)=>res.json(db.data.templates.filter(t=>t.workspaceId===req.workspace.id)))
tplR.post('/',    async (req,res) => {
  const { name, category, subject, body } = req.body
  if (!name||!body) return res.status(400).json({ error:'name and body required' })
  const tpl = { id:nextId('templates'), workspaceId:req.workspace.id, name, category:category||'general', subject:subject||'', body, uses:0, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
  db.data.templates.push(tpl); await db.write(); res.json(tpl)
})
tplR.put('/:id',  async (req,res) => {
  const t=db.data.templates.find(t=>t.id===parseInt(req.params.id) && t.workspaceId===req.workspace.id)
  if (!t) return res.status(404).json({ error:'Not found' })
  const { id:_id, workspaceId:_wsId, ...updates } = req.body
  Object.assign(t,updates,{updatedAt:new Date().toISOString()}); await db.write(); res.json(t)
})
tplR.delete('/:id', async (req,res) => {
  db.data.templates=db.data.templates.filter(t=>!(t.id===parseInt(req.params.id) && t.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok:true })
})

app.use('/api/templates', tplR)

// ═══════════════════════════════════════════════════════════════════════════════
// FORMS & LANDING PAGES
// ═══════════════════════════════════════════════════════════════════════════════

function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
function generateUniqueSlug(name) {
  const base = slugify(name) || 'page'
  let slug = base, i = 1
  while (db.data.landingPages.some(p => p.slug === slug)) slug = `${base}-${++i}`
  return slug
}

const formR = express.Router()
formR.use(requireAuth, requireWorkspace)

formR.get('/', (req, res) => {
  res.json(db.data.forms.filter(f => f.workspaceId === req.workspace.id))
})

formR.get('/:id', (req, res) => {
  const f = db.data.forms.find(f => f.id===parseInt(req.params.id) && f.workspaceId===req.workspace.id)
  if (!f) return res.status(404).json({ error: 'Not found' })
  res.json(f)
})

formR.post('/', async (req, res) => {
  const { name, fields, tagsToApply, listsToApply, successMessage, redirectUrl } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  const form = {
    id: nextId('forms'), workspaceId: req.workspace.id, name: name.trim(),
    fields: { email: true, firstName: !!fields?.firstName, lastName: !!fields?.lastName, company: !!fields?.company, phone: !!fields?.phone },
    tagsToApply: tagsToApply || [], listsToApply: listsToApply || [],
    successMessage: successMessage || 'Thanks for signing up!',
    redirectUrl: redirectUrl || null,
    submissionCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  db.data.forms.push(form); await db.write(); res.status(201).json(form)
})

formR.put('/:id', async (req, res) => {
  const f = db.data.forms.find(f => f.id===parseInt(req.params.id) && f.workspaceId===req.workspace.id)
  if (!f) return res.status(404).json({ error: 'Not found' })
  const { id:_id, workspaceId:_wsId, submissionCount:_sc, ...updates } = req.body
  Object.assign(f, updates, { updatedAt: new Date().toISOString() })
  await db.write(); res.json(f)
})

formR.delete('/:id', async (req, res) => {
  db.data.forms = db.data.forms.filter(f => !(f.id===parseInt(req.params.id) && f.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok: true })
})

app.use('/api/forms', formR)

const landingR = express.Router()
landingR.use(requireAuth, requireWorkspace)

landingR.get('/', (req, res) => {
  res.json(db.data.landingPages.filter(p => p.workspaceId === req.workspace.id))
})

landingR.get('/:id', (req, res) => {
  const p = db.data.landingPages.find(p => p.id===parseInt(req.params.id) && p.workspaceId===req.workspace.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  res.json(p)
})

landingR.post('/', async (req, res) => {
  const { name, headline, subheadline, body, formId } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  const page = {
    id: nextId('landingPages'), workspaceId: req.workspace.id, name: name.trim(),
    slug: generateUniqueSlug(name),
    headline: headline || name.trim(), subheadline: subheadline || '', body: body || '',
    formId: formId || null, status: 'draft', viewCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  db.data.landingPages.push(page); await db.write(); res.status(201).json(page)
})

landingR.put('/:id', async (req, res) => {
  const p = db.data.landingPages.find(p => p.id===parseInt(req.params.id) && p.workspaceId===req.workspace.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  const { id:_id, workspaceId:_wsId, slug:newSlug, viewCount:_vc, status:_st, ...updates } = req.body
  if (newSlug && newSlug !== p.slug) {
    const clean = slugify(newSlug)
    if (!clean) return res.status(400).json({ error: 'Invalid URL slug.' })
    if (db.data.landingPages.some(pg => pg.id !== p.id && pg.slug === clean))
      return res.status(409).json({ error: 'That URL slug is already taken.' })
    p.slug = clean
  }
  Object.assign(p, updates, { updatedAt: new Date().toISOString() })
  await db.write(); res.json(p)
})

landingR.post('/:id/publish', async (req, res) => {
  const p = db.data.landingPages.find(p => p.id===parseInt(req.params.id) && p.workspaceId===req.workspace.id)
  if (!p) return res.status(404).json({ error: 'Not found' })
  p.status = p.status === 'published' ? 'draft' : 'published'
  p.updatedAt = new Date().toISOString()
  await db.write(); res.json(p)
})

landingR.delete('/:id', async (req, res) => {
  db.data.landingPages = db.data.landingPages.filter(p => !(p.id===parseInt(req.params.id) && p.workspaceId===req.workspace.id))
  await db.write(); res.json({ ok: true })
})

app.use('/api/landing-pages', landingR)

// ─── Public (unauthenticated) endpoints ───────────────────────────────────────
// CORS for these is handled by the dynamic origin function on the app-level
// cors() middleware above (see the isPublic check there).

const publicR = express.Router()

publicR.get('/forms/:id', (req, res) => {
  const f = db.data.forms.find(f => f.id === parseInt(req.params.id))
  if (!f) return res.status(404).json({ error: 'Form not found.' })
  res.json({ id: f.id, name: f.name, fields: f.fields })
})

publicR.post('/forms/:id/submit', async (req, res) => {
  const f = db.data.forms.find(f => f.id === parseInt(req.params.id))
  if (!f) return res.status(404).json({ error: 'Form not found.' })
  const { email, firstName, lastName, company, phone } = req.body
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'A valid email address is required.' })

  const normalizedEmail = String(email).toLowerCase().trim()
  let contact = db.data.contacts.find(c => c.workspaceId===f.workspaceId && c.email.toLowerCase()===normalizedEmail)
  if (contact) {
    if (firstName && !contact.firstName) contact.firstName = firstName
    if (lastName  && !contact.lastName)  contact.lastName  = lastName
    if (company   && !contact.company)   contact.company   = company
    if (phone     && !contact.phone)     contact.phone     = phone
    for (const tag  of f.tagsToApply)  if (!contact.tags.includes(tag))   contact.tags.push(tag)
    for (const list of f.listsToApply) if (!contact.lists.includes(list)) contact.lists.push(list)
  } else {
    contact = {
      id: nextId('contacts'), workspaceId: f.workspaceId,
      email: normalizedEmail, firstName: firstName||'', lastName: lastName||'', company: company||'',
      phone: phone||'', location:'', website:'', notes:'',
      tags: [...f.tagsToApply], lists: [...f.listsToApply],
      status: 'subscribed', added: new Date().toISOString(), lastEmailed: null,
    }
    db.data.contacts.push(contact)
  }
  f.submissionCount = (f.submissionCount||0) + 1
  await db.write()

  // Matches by form NAME (not id) — consistent with how tag_added/list_added
  // triggers already match by a human-readable string the user typed in.
  triggerAutomation(f.workspaceId, 'form_submitted', contact, f.name).catch(()=>{})

  res.json({ ok: true, message: f.successMessage, redirectUrl: f.redirectUrl || null })
})

publicR.get('/landing-pages/:slug', (req, res) => {
  const p = db.data.landingPages.find(p => p.slug === String(req.params.slug).toLowerCase())
  if (!p || p.status !== 'published') return res.status(404).json({ error: 'Page not found.' })
  p.viewCount = (p.viewCount||0) + 1
  db.write().catch(console.error)
  const form = p.formId ? db.data.forms.find(f => f.id === p.formId) : null
  res.json({
    name: p.name, headline: p.headline, subheadline: p.subheadline, body: p.body,
    form: form ? { id: form.id, name: form.name, fields: form.fields } : null,
  })
})

// GET is read-only on purpose — corporate email scanners and Outlook Safe
// Links prefetch every URL in an inbound message, so an unsubscribe link that
// acts on GET silently unsubscribes people who never clicked anything. The
// actual unsubscribe only happens on the POST below, triggered by a real
// button click on the confirmation page.
publicR.get('/unsubscribe/:token', (req, res) => {
  const contact = db.data.contacts.find(c => c.unsubscribeToken === req.params.token)
  if (!contact) return res.status(404).json({ error: 'This unsubscribe link is invalid or has expired.' })
  res.json({ email: contact.email, alreadyUnsubscribed: contact.status === 'unsubscribed' })
})

publicR.post('/unsubscribe/:token', async (req, res) => {
  const contact = db.data.contacts.find(c => c.unsubscribeToken === req.params.token)
  if (!contact) return res.status(404).json({ error: 'This unsubscribe link is invalid or has expired.' })
  contact.status = 'unsubscribed'
  await db.write()
  res.json({ ok: true, email: contact.email })
})

app.use('/api/public', publicR)

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

const campR = express.Router()
campR.use(requireAuth, requireWorkspace)

function campStats(id, variantId) {
  let r = db.data.campaignRecipients.filter(r=>r.campaignId===id)
  if (variantId) r = r.filter(x=>x.variantId===variantId)
  const sent=r.filter(x=>x.sentAt).length
  return {
    total:r.length, sent,
    opened:  r.filter(x=>x.openedAt).length,
    clicked: r.filter(x=>x.clickedAt).length,
    bounced: r.filter(x=>x.bouncedAt).length,
    failed:  r.filter(x=>x.failedAt).length,
    openRate:  sent ? Math.round(r.filter(x=>x.openedAt).length/sent*100) : 0,
    clickRate: sent ? Math.round(r.filter(x=>x.clickedAt).length/sent*100) : 0,
  }
}

// A/B test campaigns additionally carry per-variant stats so the UI can show
// variant A vs. variant B performance side by side.
function withCampStats(c) {
  const out = { ...c, stats: campStats(c.id) }
  if (c.abTest?.enabled) out.variantStats = { a: campStats(c.id,'a'), b: campStats(c.id,'b') }
  return out
}

campR.get('/',     (req,res)=>res.json(db.data.campaigns.filter(c=>c.workspaceId===req.workspace.id).map(withCampStats)))
campR.get('/:id',  (req,res)=>{ const c=db.data.campaigns.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id); if(!c)return res.status(404).json({error:'Not found'}); res.json(withCampStats(c)) })

campR.post('/', async (req,res) => {
  if (req.body.abTest?.enabled) {
    const ab = req.body.abTest
    const variants = ab.variants
    if (!Array.isArray(variants) || variants.length !== 2 || variants.some(v=>!v.subject?.trim() || !v.htmlBody?.trim()))
      return res.status(400).json({ error:'A/B test requires exactly 2 variants, each with a subject and body.' })
    if (!['openRate','clickRate'].includes(ab.winnerMetric))
      return res.status(400).json({ error:'winnerMetric must be "openRate" or "clickRate".' })
    if (!(ab.testPercent > 0 && ab.testPercent <= 100))
      return res.status(400).json({ error:'testPercent must be between 1 and 100.' })
    if (!(ab.testDurationHours > 0))
      return res.status(400).json({ error:'testDurationHours must be greater than 0.' })
    ab.variants = [{ ...variants[0], id:'a' }, { ...variants[1], id:'b' }]
    ab.testSentAt = null; ab.winnerVariantId = null; ab.winnerSentAt = null; ab.finalStats = null
  }
  const c = {
    ...req.body,
    id:nextId('campaigns'), workspaceId:req.workspace.id,
    status: req.body.scheduledAt ? 'scheduled' : 'draft',
    sentAt:null, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
  }
  db.data.campaigns.push(c); await db.write(); res.json(c)
})

campR.put('/:id', async (req,res) => {
  const c=db.data.campaigns.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  if (['sent','sending','testing'].includes(c.status)) return res.status(400).json({ error:'Cannot edit a campaign that is sending, testing, or already sent.' })
  const { id:_id, workspaceId:_wsId, ...updates } = req.body
  Object.assign(c,updates,{updatedAt:new Date().toISOString()}); await db.write(); res.json(c)
})

campR.delete('/:id', async (req,res) => {
  const id=parseInt(req.params.id)
  const c=db.data.campaigns.find(c=>c.id===id && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  db.data.campaigns=db.data.campaigns.filter(c=>c.id!==id)
  db.data.campaignRecipients=db.data.campaignRecipients.filter(r=>r.campaignId!==id)
  await db.write(); res.json({ ok:true })
})

// Duplicates a campaign as a fresh draft — recipients/stats/AB-test progress
// are never copied since those describe what already happened to the
// original send, not the new one.
campR.post('/:id/clone', async (req, res) => {
  const src = db.data.campaigns.find(c => c.id === parseInt(req.params.id) && c.workspaceId === req.workspace.id)
  if (!src) return res.status(404).json({ error: 'Not found' })
  const { id: _id, workspaceId: _wsId, status: _status, sentAt: _sentAt, scheduledAt: _scheduledAt, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = src
  const clone = {
    ...rest,
    id: nextId('campaigns'), workspaceId: req.workspace.id,
    name: `${src.name} (Copy)`,
    status: 'draft', sentAt: null, scheduledAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  if (clone.abTest) {
    clone.abTest = { ...clone.abTest, testSentAt: null, winnerVariantId: null, winnerSentAt: null, finalStats: null }
  }
  db.data.campaigns.push(clone)
  await db.write()
  res.status(201).json(clone)
})

// ── Deliverability checker ─────────────────────────────────────────────────────
// A lightweight, heuristic pre-send check — not a real spam-filter simulation,
// but catches the handful of things that most commonly tank inbox placement:
// spammy subject lines, a missing unsubscribe link, an unverified sending
// domain, image-only bodies, and broken links.

const SPAM_TRIGGER_WORDS = [
  'free', 'act now', 'click here', 'buy now', 'order now', 'limited time',
  'satisfaction guaranteed', '100% free', 'risk-free', 'no obligation',
  'winner', 'congratulations', 'urgent', 'act immediately', 'cash bonus',
  'cheap', 'discount', 'earn money', 'extra income', 'get paid', 'no fees',
  'once in a lifetime', 'special promotion', 'lowest price', 'while supplies last',
]

function extractLinks(html) {
  const urls = new Set()
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html || ''))) {
    if (/^https?:\/\//i.test(m[1])) urls.add(m[1])
  }
  return [...urls].slice(0, 20)
}

async function checkLink(url) {
  const tryFetch = async (method) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const r = await fetch(url, { method, signal: controller.signal, redirect: 'follow' })
      return r
    } finally {
      clearTimeout(timer)
    }
  }
  try {
    let r = await tryFetch('HEAD')
    if (r.status === 405 || r.status === 501) r = await tryFetch('GET')
    return { url, ok: r.ok, status: r.status }
  } catch (e) {
    return { url, ok: false, error: e.message }
  }
}

campR.post('/deliverability-check', async (req, res) => {
  const { subject = '', htmlBody = '', fromAccountId } = req.body
  const checks = []

  const subjLower = subject.toLowerCase()
  const foundSpamWords = SPAM_TRIGGER_WORDS.filter(w => subjLower.includes(w))
  checks.push({
    id: 'subject-spam-words', label: 'Subject line avoids spam trigger words',
    status: foundSpamWords.length ? 'warn' : 'pass',
    detail: foundSpamWords.length ? `Found: ${foundSpamWords.join(', ')}` : 'No common spam trigger words found.',
  })

  checks.push({
    id: 'subject-length', label: 'Subject line length',
    status: subject.length > 60 ? 'warn' : 'pass',
    detail: subject.length > 60 ? `${subject.length} characters — may get truncated in inboxes (aim for under 60).` : `${subject.length} characters.`,
  })

  const isAllCaps = subject.length > 3 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)
  checks.push({
    id: 'subject-caps', label: "Subject line isn't all caps",
    status: isAllCaps ? 'warn' : 'pass',
    detail: isAllCaps ? 'ALL CAPS subject lines are a common spam signal.' : 'OK.',
  })

  const hasUnsub = /\{\{unsubscribe_link\}\}/i.test(htmlBody) || /\/unsubscribe\//i.test(htmlBody)
  checks.push({
    id: 'unsubscribe-link', label: 'Contains an unsubscribe link',
    status: hasUnsub ? 'pass' : 'fail',
    detail: hasUnsub ? 'Found the {{unsubscribe_link}} merge tag.' : 'No unsubscribe link found — add {{unsubscribe_link}} to the body. This is legally required (CAN-SPAM/GDPR).',
  })

  let domainCheck = { id: 'domain-auth', label: 'Sending domain has SPF/DKIM/DMARC verified', status: 'warn', detail: 'Could not determine the sending domain.' }
  if (fromAccountId) {
    const account = db.data.emailAccounts.find(a => a.id === parseInt(fromAccountId) && a.workspaceId === req.workspace.id)
    if (account?.email?.includes('@')) {
      const domainName = account.email.split('@')[1]
      const domain = db.data.domains.find(d => d.workspaceId === req.workspace.id && d.domain === domainName)
      if (domain) {
        const dkimOk = domain.dkimStatus === 'pass' || domain.dkimStatus === 'external'
        const allPass = domain.spfStatus === 'pass' && dkimOk && domain.dmarcStatus === 'pass'
        domainCheck = {
          id: 'domain-auth', label: 'Sending domain has SPF/DKIM/DMARC verified',
          status: allPass ? 'pass' : 'warn',
          detail: allPass ? `${domainName} is fully verified.` : `${domainName}: SPF ${domain.spfStatus}, DKIM ${domain.dkimStatus}, DMARC ${domain.dmarcStatus}. Unverified domains are more likely to land in spam.`,
        }
      } else {
        domainCheck = { id: 'domain-auth', label: 'Sending domain has SPF/DKIM/DMARC verified', status: 'warn', detail: `"${domainName}" isn't set up under Domains — add and verify it to improve deliverability.` }
      }
    }
  }
  checks.push(domainCheck)

  const imgCount = (htmlBody.match(/<img\b/gi) || []).length
  const textLen = htmlBody.replace(/<[^>]+>/g, '').trim().length
  const imageHeavy = imgCount > 0 && textLen < 100
  checks.push({
    id: 'image-text-ratio', label: 'Not image-only content',
    status: imageHeavy ? 'warn' : 'pass',
    detail: imageHeavy ? `Only ${textLen} characters of text alongside ${imgCount} image(s) — spam filters flag image-heavy, text-light emails.` : 'OK.',
  })

  const links = extractLinks(htmlBody)
  if (links.length) {
    const results = await Promise.all(links.map(checkLink))
    const broken = results.filter(r => !r.ok)
    checks.push({
      id: 'broken-links', label: `Links are reachable (${links.length} checked)`,
      status: broken.length ? 'fail' : 'pass',
      detail: broken.length ? `${broken.length} broken link(s): ${broken.map(b => b.url).join(', ')}` : 'All links responded OK.',
    })
  } else {
    checks.push({ id: 'broken-links', label: 'Links are reachable', status: 'pass', detail: 'No links found in the body.' })
  }

  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const score = Math.max(0, 100 - failCount * 25 - warnCount * 10)

  res.json({ score, checks })
})

// Resolve audience contacts for a campaign (contacts are already implicitly
// scoped since a campaign's contactIds/lists/tags only ever reference contacts
// within the same workspace it was created in).
function resolveCampaignAudience(campaign) {
  let contacts = db.data.contacts.filter(c=>c.workspaceId===campaign.workspaceId && c.status==='subscribed')
  if (campaign.contactIds?.length) return contacts.filter(c=>campaign.contactIds.includes(c.id))
  if (campaign.segmentId) {
    const seg = db.data.segments.find(s=>s.id===campaign.segmentId && s.workspaceId===campaign.workspaceId)
    return seg ? evaluateSegment(contacts, seg.conditions, seg.matchType, campaign.workspaceId) : []
  }
  if (campaign.lists?.length)  contacts = contacts.filter(c=>c.lists?.some(l=>campaign.lists.includes(l)))
  else if (campaign.tags?.length) contacts = contacts.filter(c=>c.tags?.some(t=>campaign.tags.includes(t)))
  return contacts
}

function shuffled(arr) {
  const a = arr.slice()
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] }
  return a
}

async function sendCampaignBatch(campaign, account, recs, subject, htmlBody) {
  const transport = makeTransport(account)
  for (const rec of recs) {
    const c = db.data.contacts.find(c=>c.id===rec.contactId)
    if (!c) continue
    try {
      await transport.sendMail({
        from:`"${campaign.fromName||account.fromName||account.name}" <${account.email}>`,
        to:c.email, replyTo:campaign.replyTo||undefined,
        subject:fillTags(subject,c,account),
        html:addTracking(fillTags(htmlBody,c,account), rec.id),
      })
      rec.sentAt=new Date().toISOString()
      c.lastEmailed=new Date().toISOString()
      account.sentToday=(account.sentToday||0)+1
      account.totalSent=(account.totalSent||0)+1
    } catch(e) { rec.failedAt=new Date().toISOString() }
    await db.write()
    await new Promise(r=>setTimeout(r,80))
  }
}

// Picks (or is told) the winning variant, sends its content to whichever
// recipients were held back from the initial test batch, and closes out the
// campaign. Shared by the automatic (duration-elapsed) and manual (early
// override) winner-selection paths.
async function finalizeAbTest(campaign, winnerId) {
  campaign.abTest.winnerVariantId = winnerId
  campaign.abTest.finalStats = { a: campStats(campaign.id,'a'), b: campStats(campaign.id,'b') }
  const winnerVariant = campaign.abTest.variants.find(v=>v.id===winnerId)
  const account = db.data.emailAccounts.find(a=>a.id===campaign.fromAccountId)
  const remainder = db.data.campaignRecipients.filter(r=>r.campaignId===campaign.id && !r.isTestSample && !r.sentAt)
  if (!account || !account.smtpPass || !remainder.length) {
    campaign.status='sent'; campaign.abTest.winnerSentAt=new Date().toISOString(); await db.write(); return
  }
  campaign.status='sending'; await db.write()
  await sendCampaignBatch(campaign, account, remainder, winnerVariant.subject, winnerVariant.htmlBody)
  campaign.status='sent'; campaign.abTest.winnerSentAt=new Date().toISOString(); await db.write()
  pushNotif(campaign.workspaceId, 'campaign', 'A/B test winner selected & sent',
    `"${campaign.name}" — variant ${winnerId.toUpperCase()} won. Sent to ${remainder.length} remaining contact${remainder.length!==1?'s':''}.`,
    { label: 'View report', href: '/campaigns' }
  )
}

// Ticks every 60s (see startup()) looking for A/B tests whose test window has
// elapsed, so the winner gets picked and the remainder sent automatically
// even if nobody has the app open.
async function processAbTests() {
  const now = Date.now()
  const pending = db.data.campaigns.filter(c => c.status==='testing' && c.abTest?.enabled && !c.abTest.winnerVariantId)
  for (const campaign of pending) {
    const elapsedHours = (now - new Date(campaign.abTest.testSentAt).getTime()) / 3600000
    if (elapsedHours < campaign.abTest.testDurationHours) continue
    const metric = campaign.abTest.winnerMetric
    const statsA = campStats(campaign.id,'a'), statsB = campStats(campaign.id,'b')
    const winnerId = statsA[metric] >= statsB[metric] ? 'a' : 'b'
    await finalizeAbTest(campaign, winnerId)
  }
}

campR.post('/:id/send', requirePlanActive, async (req,res) => {
  const campaign = db.data.campaigns.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!campaign) return res.status(404).json({ error:'Campaign not found.' })
  if (campaign.status==='sent') return res.status(400).json({ error:'Already sent.' })
  if (campaign.status==='sending' || campaign.status==='testing') return res.status(400).json({ error:'Currently sending.' })
  const account = db.data.emailAccounts.find(a=>a.id===campaign.fromAccountId && a.workspaceId===req.workspace.id)
  if (!account) return res.status(400).json({ error:'No sending account configured. Edit campaign → choose an email account.' })
  if (!account.smtpPass) return res.status(400).json({ error:'SMTP password missing. Edit the email account to add credentials.' })
  const contacts = resolveCampaignAudience(campaign)
  if (!contacts.length) return res.status(400).json({ error:'No subscribed contacts match this campaign\'s audience.' })
  const limitErr = checkEmailLimit(contacts.length, req.workspace.id, req.planInfo)
  if (limitErr) return res.status(403).json(limitErr)

  const ab = campaign.abTest?.enabled ? campaign.abTest : null

  if (!ab) {
    campaign.status='sending'; campaign.sentAt=new Date().toISOString()
    const newRecs = contacts.map(c=>({ id:nextId('campaignRecipients'), workspaceId:req.workspace.id, campaignId:campaign.id, contactId:c.id, email:c.email, sentAt:null,failedAt:null,openedAt:null,clickedAt:null,bouncedAt:null, variantId:null, isTestSample:false }))
    db.data.campaignRecipients.push(...newRecs); await db.write()

    res.json({ ok:true, recipientCount:contacts.length, message:`Queued for ${contacts.length} contacts. Sending in background…` })

    ;(async()=>{
      await sendCampaignBatch(campaign, account, newRecs, campaign.subject, campaign.htmlBody)
      campaign.status='sent'; await db.write()
      console.log(`Campaign "${campaign.name}" sent to ${contacts.length} contacts.`)
      pushNotif(req.workspace.id, 'campaign', 'Campaign sent successfully',
        `"${campaign.name}" delivered to ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}.`,
        { label: 'View report', href: '/campaigns' }
      )
    })().catch(console.error)
    return
  }

  // A/B test: split a sample of the audience across the two variants, send
  // those now, and hold the rest back until a winner is picked (either
  // automatically once testDurationHours elapses, or early via /pick-winner).
  const testCount = Math.max(2, Math.round(contacts.length * ab.testPercent / 100))
  const perVariant = Math.max(1, Math.floor(testCount / 2))
  const pool = shuffled(contacts)
  const groupA = pool.slice(0, perVariant)
  const groupB = pool.slice(perVariant, perVariant*2)
  const remainder = pool.slice(perVariant*2)

  campaign.status='sending'; campaign.sentAt=new Date().toISOString()
  ab.testSentAt = new Date().toISOString()

  const makeRec = (c,variantId,isTestSample) => ({ id:nextId('campaignRecipients'), workspaceId:req.workspace.id, campaignId:campaign.id, contactId:c.id, email:c.email, sentAt:null,failedAt:null,openedAt:null,clickedAt:null,bouncedAt:null, variantId, isTestSample })
  const recsA = groupA.map(c=>makeRec(c,'a',true))
  const recsB = groupB.map(c=>makeRec(c,'b',true))
  const recsRemainder = remainder.map(c=>makeRec(c,null,false))
  db.data.campaignRecipients.push(...recsA, ...recsB, ...recsRemainder)
  await db.write()

  res.json({ ok:true, recipientCount:contacts.length, message:`A/B test started — ${recsA.length + recsB.length} contacts (variant A/B), ${recsRemainder.length} waiting for the winner.` })

  ;(async()=>{
    const variantA = ab.variants.find(v=>v.id==='a'), variantB = ab.variants.find(v=>v.id==='b')
    await sendCampaignBatch(campaign, account, recsA, variantA.subject, variantA.htmlBody)
    await sendCampaignBatch(campaign, account, recsB, variantB.subject, variantB.htmlBody)
    campaign.status='testing'; await db.write()
    console.log(`A/B test batch sent for campaign "${campaign.name}" — awaiting ${ab.testDurationHours}h before picking a winner.`)
    pushNotif(req.workspace.id, 'campaign', 'A/B test started',
      `"${campaign.name}" — test emails sent to ${recsA.length+recsB.length} contacts. Winner picked automatically in ${ab.testDurationHours}h.`,
      { label: 'View report', href: '/campaigns' }
    )
  })().catch(console.error)
})

// Lets a user lock in a winner before testDurationHours elapses (e.g. one
// variant is already clearly ahead) instead of waiting out the full window.
campR.post('/:id/pick-winner', async (req,res) => {
  const campaign = db.data.campaigns.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!campaign) return res.status(404).json({ error:'Not found' })
  if (!campaign.abTest?.enabled) return res.status(400).json({ error:'Not an A/B test campaign.' })
  if (campaign.status!=='testing') return res.status(400).json({ error:'Test is not currently running.' })
  const { variantId } = req.body
  if (!['a','b'].includes(variantId)) return res.status(400).json({ error:'variantId must be "a" or "b".' })
  res.json({ ok:true })
  finalizeAbTest(campaign, variantId).catch(console.error)
})

campR.get('/:id/stats', (req,res) => {
  const c=db.data.campaigns.find(c=>c.id===parseInt(req.params.id) && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  res.json({ ...campStats(c.id), status:c.status, ...(c.abTest?.enabled?{variantStats:{a:campStats(c.id,'a'),b:campStats(c.id,'b')}}:{}) })
})

// 1×1 open-tracking pixel
app.get('/track/open/:recId', (req,res) => {
  const r=db.data.campaignRecipients.find(r=>r.id===parseInt(req.params.recId))
  if (r&&!r.openedAt) { r.openedAt=new Date().toISOString(); db.write() }
  const gif=Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==','base64')
  res.set({'Content-Type':'image/gif','Cache-Control':'no-store'}).send(gif)
})

// Click-tracking redirect: records the click, then forwards to the real URL.
app.get('/track/click/:recId', (req,res) => {
  const r=db.data.campaignRecipients.find(r=>r.id===parseInt(req.params.recId))
  if (r&&!r.clickedAt) { r.clickedAt=new Date().toISOString(); db.write() }
  const dest = req.query.u ? String(req.query.u) : ''
  if (!/^https?:\/\//i.test(dest)) return res.redirect(FRONTEND)
  res.redirect(dest)
})

app.use('/api/campaigns', campR)

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const autoR = express.Router()
autoR.use(requireAuth, requireWorkspace)

autoR.get('/', (req,res) => {
  res.json(db.data.automations.filter(a=>a.workspaceId===req.workspace.id).map(a=>({
    ...a,
    enrolledCount:  db.data.automationEnrollments.filter(e=>e.automationId===a.id&&e.status==='active').length,
    completedCount: db.data.automationEnrollments.filter(e=>e.automationId===a.id&&e.status==='completed').length,
  })))
})

autoR.get('/:id', (req,res) => {
  const a=db.data.automations.find(a=>a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error:'Not found' })
  res.json({ ...a, enrollments:db.data.automationEnrollments.filter(e=>e.automationId===a.id) })
})

autoR.post('/', async (req,res) => {
  const { name, nodes, edges } = req.body
  if (!name) return res.status(400).json({ error:'name required' })
  const a = { id:nextId('automations'), workspaceId:req.workspace.id, name, nodes:nodes||[], edges:edges||[], status:'draft', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
  db.data.automations.push(a); await db.write(); res.json(a)
})

autoR.put('/:id', async (req,res) => {
  const a=db.data.automations.find(a=>a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error:'Not found' })
  const { id:_id, workspaceId:_wsId, ...updates } = req.body
  Object.assign(a,updates,{updatedAt:new Date().toISOString()}); await db.write(); res.json(a)
})

autoR.delete('/:id', async (req,res) => {
  const id=parseInt(req.params.id)
  const a=db.data.automations.find(a=>a.id===id && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error:'Not found' })
  db.data.automations=db.data.automations.filter(a=>a.id!==id)
  db.data.automationEnrollments=db.data.automationEnrollments.filter(e=>e.automationId!==id)
  await db.write(); res.json({ ok:true })
})

autoR.post('/:id/toggle', async (req,res) => {
  const a=db.data.automations.find(a=>a.id===parseInt(req.params.id) && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error:'Not found' })
  a.status=a.status==='active'?'paused':'active'; a.updatedAt=new Date().toISOString()
  await db.write(); res.json(a)
})

autoR.post('/:id/enroll', async (req,res) => {
  const autoId=parseInt(req.params.id), { contactId }=req.body
  const a=db.data.automations.find(a=>a.id===autoId && a.workspaceId===req.workspace.id)
  if (!a) return res.status(404).json({ error:'Not found' })
  const c=db.data.contacts.find(c=>c.id===contactId && c.workspaceId===req.workspace.id)
  if (!c) return res.status(404).json({ error:'Contact not found' })
  const trigger=a.nodes.find(n=>n.type==='trigger')
  const firstEdge=a.edges.find(e=>e.source===trigger?.id)
  const enrollment={
    id:nextId('automationEnrollments'), workspaceId:req.workspace.id, automationId:autoId, contactId,
    currentNodeId:firstEdge?.target||a.nodes[0]?.id,
    enrolledAt:new Date().toISOString(), nextRunAt:new Date().toISOString(),
    status:'active', history:[],
  }
  db.data.automationEnrollments.push(enrollment); await db.write(); res.json(enrollment)
})

app.use('/api/automations', autoR)

// ═══════════════════════════════════════════════════════════════════════════════
// STATS (Dashboard)
// ═══════════════════════════════════════════════════════════════════════════════

const statsR = express.Router()
statsR.use(requireAuth, requireWorkspace)

statsR.get('/overview', (req,res) => {
  const r=db.data.campaignRecipients.filter(x=>x.workspaceId===req.workspace.id)
  const sent=r.filter(x=>x.sentAt).length
  const opened=r.filter(x=>x.openedAt).length
  const clicked=r.filter(x=>x.clickedAt).length
  // Monthly chart: last 6 months
  const chart=[]
  for (let i=5; i>=0; i--) {
    const d=new Date(); d.setMonth(d.getMonth()-i)
    const label=d.toLocaleDateString('en-US',{month:'short'})
    const start=new Date(d.getFullYear(),d.getMonth(),1).toISOString()
    const end  =new Date(d.getFullYear(),d.getMonth()+1,0).toISOString()
    const mR=r.filter(x=>x.sentAt&&x.sentAt>=start&&x.sentAt<=end)
    const mSent=mR.filter(x=>x.sentAt).length
    chart.push({ month:label, sent:mSent, opened:mR.filter(x=>x.openedAt).length, rate:mSent?Math.round(mR.filter(x=>x.openedAt).length/mSent*100):0 })
  }
  const wsCampaigns   = db.data.campaigns.filter(c=>c.workspaceId===req.workspace.id)
  const wsAutomations = db.data.automations.filter(a=>a.workspaceId===req.workspace.id)
  const upcoming=wsCampaigns.filter(c=>c.status==='scheduled'&&c.scheduledAt).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt)).slice(0,5)
  res.json({
    totals:{
      sent, opened, clicked,
      openRate: sent?Math.round(opened/sent*100):0,
      clickRate:sent?Math.round(clicked/sent*100):0,
      contacts:  db.data.contacts.filter(c=>c.workspaceId===req.workspace.id).length,
      campaigns: wsCampaigns.filter(c=>c.status==='sent').length,
      automations:wsAutomations.filter(a=>a.status==='active').length,
    },
    chart, upcoming,
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX  (IMAP sync + compose/reply via SMTP)
// ═══════════════════════════════════════════════════════════════════════════════

const inboxR = express.Router()
inboxR.use(requireAuth, requireWorkspace)

// Derive IMAP host from SMTP host (mail.x.com → imap.x.com, smtp.x.com → imap.x.com)
function imapHostFor(smtpHost) {
  if (!smtpHost) return null
  return smtpHost.replace(/^(mail|smtp|out)\./i, 'imap.')
}

// Strip surrounding angle-brackets from a Message-ID
function cleanMsgId(id) { return (id||'').replace(/^<|>$/g, '') }

// Parse plain-text out of an email body (strip HTML tags as fallback)
function bodyText(parsed) {
  if (parsed.text) return parsed.text.trim()
  if (parsed.html)  return parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()
  return ''
}

// Sync one account's INBOX via IMAP; returns { added, errors }
async function syncAccount(account) {
  const host = account.imapHost || imapHostFor(account.smtpHost)
  if (!host) return { added: 0, error: 'No IMAP host' }

  const client = new ImapFlow({
    host,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    auth: { user: account.imapUser || account.smtpUser, pass: account.imapPass || account.smtpPass },
    logger: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
  } catch(e) {
    return { added: 0, error: e.message }
  }

  let added = 0
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      // Fetch last 50 messages (newest first by searching all and taking tail)
      const uids = await client.search({ seen: false }) // unread first
      const allUids = await client.search({})
      const toFetch = [...new Set([...uids, ...allUids])].slice(-50) // last 50

      if (toFetch.length > 0) {
        for await (const msg of client.fetch(toFetch, { source: true, uid: true, flags: true }, { uid: true })) {
          const parsed = await simpleParser(msg.source)
          const msgId  = cleanMsgId(parsed.messageId)

          // Skip already stored
          const exists = db.data.inboxThreads.some(t =>
            t.messages.some(m => m.id === msgId)
          )
          if (exists) continue

          const fromAddr  = parsed.from?.value?.[0]
          const fromEmail = fromAddr?.address || ''
          const fromName  = fromAddr?.name || fromEmail
          const subject   = (parsed.subject || '(no subject)').replace(/^(Re|Fwd?):\s*/i, '')
          const direction = account.email && fromEmail.toLowerCase() === account.email.toLowerCase() ? 'out' : 'in'
          const time      = (parsed.date || new Date()).toISOString()
          const text      = bodyText(parsed)
          const inReplyTo = cleanMsgId(parsed.inReplyTo)

          const newMsg = {
            id: msgId || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fromName, fromEmail, direction, body: text, time,
            inReplyTo: inReplyTo || null,
            flags: [...(msg.flags || [])],
          }

          // Try to find an existing thread by inReplyTo or subject+account
          let thread = inReplyTo
            ? db.data.inboxThreads.find(t => t.accountId === account.id && t.messages.some(m => m.id === inReplyTo))
            : db.data.inboxThreads.find(t => t.accountId === account.id && t.subject.toLowerCase() === subject.toLowerCase())

          if (thread) {
            thread.messages.push(newMsg)
            thread.messages.sort((a, b) => new Date(a.time) - new Date(b.time))
            thread.lastMessageAt = time
            if (direction === 'in') thread.read = false
            thread.hasAttachment = thread.hasAttachment || (parsed.attachments?.length > 0)
          } else {
            thread = {
              id: nextId('inboxThreads'),
              workspaceId: account.workspaceId,
              accountId: account.id,
              subject,
              messages: [newMsg],
              read: msg.flags?.has('\\Seen') || direction === 'out',
              starred: msg.flags?.has('\\Flagged') || false,
              archived: false,
              labels: [],
              hasAttachment: parsed.attachments?.length > 0,
              lastMessageAt: time,
            }
            db.data.inboxThreads.push(thread)
          }
          added++
        }
      }
    } finally {
      lock.release()
    }
  } catch(e) {
    await client.logout().catch(()=>{})
    return { added, error: e.message }
  }

  await client.logout().catch(()=>{})
  await db.write()
  if (added > 0)
    pushNotif(account.workspaceId, 'system', 'New messages synced',
      `${added} new message${added !== 1 ? 's' : ''} synced to your inbox.`,
      { label: 'Open inbox', href: '/inbox' }
    )
  return { added }
}

// Ticks every 60s (see startup()) syncing every connected email account's
// INBOX across every workspace, so replies show up — and trigger a
// notification via syncAccount() — without anyone having to open the inbox
// and hit "sync" manually. Guarded against overlap since a full pass across
// many accounts can take longer than the tick interval.
let inboxSyncRunning = false
async function processInboxSync() {
  if (inboxSyncRunning) return
  inboxSyncRunning = true
  try {
    const accounts = db.data.emailAccounts.filter(a => (a.imapHost || a.smtpHost) && a.status !== 'disconnected')
    for (const account of accounts) {
      try { await syncAccount(account) }
      catch (e) { console.error(`IMAP auto-sync failed for ${account.email}:`, e.message) }
    }
  } finally {
    inboxSyncRunning = false
  }
}

// GET /api/inbox/threads
inboxR.get('/threads', (req, res) => {
  const { folder='inbox', accountId, search='' } = req.query
  let list = db.data.inboxThreads.filter(t => t.workspaceId === req.workspace.id)
    .sort((a,b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))

  if (accountId && accountId !== 'all') list = list.filter(t => t.accountId === parseInt(accountId))

  if (folder === 'inbox')   list = list.filter(t => !t.archived)
  else if (folder === 'starred') list = list.filter(t => t.starred)
  else if (folder === 'sent')    list = list.filter(t => t.messages.some(m => m.direction === 'out'))
  else if (folder === 'archive') list = list.filter(t => t.archived)

  if (search) {
    const q = search.toLowerCase()
    list = list.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.messages.some(m => m.fromName.toLowerCase().includes(q) || m.body.toLowerCase().includes(q))
    )
  }
  res.json(list)
})

// PATCH /api/inbox/threads/:id  — update read/starred/archived/labels
inboxR.patch('/threads/:id', async (req, res) => {
  const t = db.data.inboxThreads.find(t => t.id === parseInt(req.params.id) && t.workspaceId === req.workspace.id)
  if (!t) return res.status(404).json({ error: 'Not found' })
  const { read, starred, archived, labels } = req.body
  if (read     !== undefined) t.read     = read
  if (starred  !== undefined) t.starred  = starred
  if (archived !== undefined) t.archived = archived
  if (labels   !== undefined) t.labels   = labels
  await db.write()
  res.json(t)
})

// DELETE /api/inbox/threads/:id
inboxR.delete('/threads/:id', async (req, res) => {
  db.data.inboxThreads = db.data.inboxThreads.filter(t => !(t.id === parseInt(req.params.id) && t.workspaceId === req.workspace.id))
  await db.write()
  res.json({ ok: true })
})

// POST /api/inbox/threads/:id/reply  — send reply via SMTP
inboxR.post('/threads/:id/reply', uploadAttachments.array('attachments', 5), async (req, res) => {
  const thread = db.data.inboxThreads.find(t => t.id === parseInt(req.params.id) && t.workspaceId === req.workspace.id)
  if (!thread) return res.status(404).json({ error: 'Not found' })

  const { body, fromAccountId } = req.body
  if (!body) return res.status(400).json({ error: 'body required' })

  const account = db.data.emailAccounts.find(a => a.id === parseInt(fromAccountId || thread.accountId) && a.workspaceId === req.workspace.id)
  if (!account) return res.status(400).json({ error: 'No email account found' })

  // Find the last inbound message to reply to
  const lastIn = [...thread.messages].reverse().find(m => m.direction === 'in')
  const replyTo = lastIn?.fromEmail

  if (!account.smtpPass) return res.status(400).json({ error: 'SMTP password not configured' })

  const attachments = (req.files || []).map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }))

  try {
    await makeTransport(account).sendMail({
      from: `"${account.fromName || account.name}" <${account.email}>`,
      to: replyTo,
      subject: `Re: ${thread.subject}`,
      text: body,
      inReplyTo: lastIn?.id ? `<${lastIn.id}>` : undefined,
      attachments: attachments.length ? attachments : undefined,
    })

    const msg = {
      id: `sent-${Date.now()}`,
      fromName: account.fromName || account.name,
      fromEmail: account.email,
      direction: 'out',
      body,
      time: new Date().toISOString(),
      inReplyTo: lastIn?.id || null,
      flags: [],
      attachmentNames: attachments.map(a => a.filename),
    }
    thread.messages.push(msg)
    thread.lastMessageAt = msg.time
    thread.hasAttachment = thread.hasAttachment || attachments.length > 0
    await db.write()
    res.json(msg)
  } catch(e) {
    res.status(502).json({ error: smtpErrorMessage(e, account) })
  }
})

// POST /api/inbox/compose  — send new email via SMTP
inboxR.post('/compose', uploadAttachments.array('attachments', 5), async (req, res) => {
  const { to, subject, body, fromAccountId } = req.body
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body required' })

  const wsAccounts = db.data.emailAccounts.filter(a => a.workspaceId === req.workspace.id)
  const account = wsAccounts.find(a => a.id === parseInt(fromAccountId)) || wsAccounts[0]
  if (!account) return res.status(400).json({ error: 'No email account configured' })
  if (!account.smtpPass) return res.status(400).json({ error: 'SMTP password not configured' })

  const attachments = (req.files || []).map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }))

  try {
    await makeTransport(account).sendMail({
      from: `"${account.fromName || account.name}" <${account.email}>`,
      to, subject, text: body,
      attachments: attachments.length ? attachments : undefined,
    })

    const thread = {
      id: nextId('inboxThreads'),
      workspaceId: req.workspace.id,
      accountId: account.id,
      subject,
      messages: [{
        id: `sent-${Date.now()}`,
        fromName: account.fromName || account.name,
        fromEmail: account.email,
        direction: 'out',
        body,
        time: new Date().toISOString(),
        inReplyTo: null,
        flags: [],
        attachmentNames: attachments.map(a => a.filename),
      }],
      read: true,
      starred: false,
      archived: false,
      labels: [],
      hasAttachment: attachments.length > 0,
      lastMessageAt: new Date().toISOString(),
    }
    db.data.inboxThreads.push(thread)
    await db.write()
    res.json(thread)
  } catch(e) {
    res.status(502).json({ error: smtpErrorMessage(e, account) })
  }
})

// POST /api/inbox/sync  — sync all connected accounts
inboxR.post('/sync', async (req, res) => {
  const accounts = db.data.emailAccounts.filter(a => a.workspaceId === req.workspace.id && a.status !== 'disconnected')
  if (!accounts.length) return res.json({ ok: true, results: [], message: 'No accounts configured.' })

  res.json({ ok: true, message: 'Sync started in background.' })

  // Run sync for each account in background
  ;(async () => {
    for (const account of accounts) {
      const result = await syncAccount(account)
      console.log(`IMAP sync [${account.email}]:`, result)
    }
  })().catch(console.error)
})

app.use('/api/inbox', inboxR)

app.use('/api/stats', statsR)

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH — powers the ⌘K box in the top bar; a light substring match
// across the handful of entity types worth jumping straight to, not a full
// text-search engine.
// ═══════════════════════════════════════════════════════════════════════════════

const searchR = express.Router()
searchR.use(requireAuth, requireWorkspace)

searchR.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (!q || q.length < 2) return res.json([])
  const wsId = req.workspace.id
  const LIMIT = 5
  const results = []

  db.data.contacts.filter(c => c.workspaceId === wsId &&
    (`${c.firstName} ${c.lastName} ${c.email} ${c.company||''}`.toLowerCase().includes(q)))
    .slice(0, LIMIT)
    .forEach(c => results.push({ type: 'contact', id: c.id, label: `${c.firstName} ${c.lastName}`.trim() || c.email, sublabel: c.email, href: '/contacts' }))

  db.data.campaigns.filter(c => c.workspaceId === wsId &&
    (`${c.name} ${c.subject||''}`.toLowerCase().includes(q)))
    .slice(0, LIMIT)
    .forEach(c => results.push({ type: 'campaign', id: c.id, label: c.name, sublabel: c.subject || c.status, href: `/campaigns/${c.id}/edit` }))

  db.data.templates.filter(t => t.workspaceId === wsId && t.name?.toLowerCase().includes(q))
    .slice(0, LIMIT)
    .forEach(t => results.push({ type: 'template', id: t.id, label: t.name, sublabel: 'Template', href: '/templates' }))

  db.data.automations.filter(a => a.workspaceId === wsId && a.name?.toLowerCase().includes(q))
    .slice(0, LIMIT)
    .forEach(a => results.push({ type: 'automation', id: a.id, label: a.name, sublabel: 'Automation', href: '/automation' }))

  ;(db.data.segments || []).filter(s => s.workspaceId === wsId && s.name?.toLowerCase().includes(q))
    .slice(0, LIMIT)
    .forEach(s => results.push({ type: 'segment', id: s.id, label: s.name, sublabel: 'Segment', href: '/segments' }))

  ;(db.data.forms || []).filter(f => f.workspaceId === wsId && f.name?.toLowerCase().includes(q))
    .slice(0, LIMIT)
    .forEach(f => results.push({ type: 'form', id: f.id, label: f.name, sublabel: 'Form', href: '/forms' }))

  ;(db.data.landingPages || []).filter(p => p.workspaceId === wsId && p.name?.toLowerCase().includes(q))
    .slice(0, LIMIT)
    .forEach(p => results.push({ type: 'landing-page', id: p.id, label: p.name, sublabel: 'Landing page', href: '/forms' }))

  db.data.emailAccounts.filter(a => a.workspaceId === wsId && (`${a.name} ${a.email}`.toLowerCase().includes(q)))
    .slice(0, LIMIT)
    .forEach(a => results.push({ type: 'account', id: a.id, label: a.name, sublabel: a.email, href: '/accounts' }))

  res.json(results.slice(0, 30))
})

app.use('/api/search', searchR)

app.get('/api/health', (_,res)=>res.json({ ok:true }))
app.get('/api/debug-db-error', (_,res)=>res.json({ dbInitError }))

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

async function triggerAutomation(workspaceId, triggerType, contact, triggerValue=null) {
  for (const a of db.data.automations.filter(a=>a.workspaceId===workspaceId && a.status==='active')) {
    const tn=a.nodes.find(n=>n.type==='trigger'&&n.data?.triggerType===triggerType)
    if (!tn) continue
    if (triggerValue&&tn.data?.triggerValue&&tn.data.triggerValue!==triggerValue) continue
    if (db.data.automationEnrollments.find(e=>e.automationId===a.id&&e.contactId===contact.id&&e.status==='active')) continue
    const fe=a.edges.find(e=>e.source===tn.id)
    if (!fe) continue
    const fn=a.nodes.find(n=>n.id===fe.target)
    const delayMs=fn?.type==='delay'?getDelayMs(fn.data):0
    db.data.automationEnrollments.push({
      id:nextId('automationEnrollments'), workspaceId, automationId:a.id, contactId:contact.id,
      currentNodeId:fe.target, enrolledAt:new Date().toISOString(),
      nextRunAt:new Date(Date.now()+delayMs).toISOString(), status:'active', history:[],
    })
  }
  await db.write()
}

function getDelayMs(data) {
  const units={minutes:60000,hours:3600000,days:86400000}
  return parseInt(data?.delayAmount||1)*(units[data?.delayUnit||'days']||86400000)
}

async function processAutomations() {
  const now=new Date().toISOString()
  const pending=db.data.automationEnrollments.filter(e=>e.status==='active'&&e.nextRunAt&&e.nextRunAt<=now)
  if (!pending.length) return

  for (const enrollment of pending) {
    const a=db.data.automations.find(a=>a.id===enrollment.automationId)
    if (!a||a.status!=='active') { enrollment.status='paused'; continue }
    const contact=db.data.contacts.find(c=>c.id===enrollment.contactId)
    if (!contact) { enrollment.status='completed'; continue }

    const node=a.nodes.find(n=>n.id===enrollment.currentNodeId)
    if (!node) { enrollment.status='completed'; continue }

    enrollment.history.push({ nodeId:node.id, type:node.type, executedAt:now })

    let condResult=undefined

    if (node.type==='email') {
      const wsAccounts=db.data.emailAccounts.filter(acc=>acc.workspaceId===a.workspaceId)
      const acct=wsAccounts.find(acc=>acc.email===node.data?.fromAccount)||wsAccounts[0]
      if (acct?.smtpPass) {
        try {
          await makeTransport(acct).sendMail({
            from:`"${acct.fromName||acct.name}" <${acct.email}>`,
            to:contact.email,
            subject:fillTags(node.data?.subject||'(No subject)',contact,acct),
            html:fillTags(node.data?.body||`<p>Hello {{first_name}},</p>`,contact,acct),
          })
          contact.lastEmailed=now
          acct.sentToday=(acct.sentToday||0)+1
          acct.totalSent=(acct.totalSent||0)+1
        } catch(e) { console.warn(`Automation email failed (${contact.email}):`,e.message) }
      }
    } else if (node.type==='action') {
      const actionType = node.data?.actionType
      if (actionType==='add_tag'&&node.data?.actionValue&&!contact.tags.includes(node.data.actionValue)) contact.tags.push(node.data.actionValue)
      else if (actionType==='remove_tag') contact.tags=contact.tags.filter(t=>t!==node.data.actionValue)
      else if (actionType==='update_field' && node.data?.actionField) {
        contact[node.data.actionField] = node.data.actionValue
      }
      else if (actionType==='webhook' && node.data?.actionValue) {
        // Fire-and-forget — a slow/unreachable webhook shouldn't stall the automation engine.
        fetch(node.data.actionValue, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'automation_action', automationId: a.id, automationName: a.name,
            contact: { id: contact.id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName, tags: contact.tags },
            timestamp: now,
          }),
        }).catch(e => console.warn(`Automation webhook failed (${node.data.actionValue}):`, e.message))
      }
      else if (actionType==='notify') {
        pushNotif(a.workspaceId, 'automation', `Automation: ${a.name}`,
          node.data?.actionValue || `${contact.firstName || contact.email} reached a notify step.`,
          { label: 'View automation', href: '/automation' }
        )
      }
    } else if (node.type==='condition') {
      const conditionType = node.data?.conditionType
      if (conditionType==='email_opened') {
        const lr=db.data.campaignRecipients.filter(r=>r.contactId===contact.id&&r.sentAt).pop()
        condResult=!!lr?.openedAt
      } else if (conditionType==='link_clicked') {
        const lr=db.data.campaignRecipients.filter(r=>r.contactId===contact.id&&r.sentAt).pop()
        condResult=!!lr?.clickedAt
      } else if (conditionType==='has_tag') {
        condResult = !!(node.data?.conditionValue && contact.tags?.includes(node.data.conditionValue))
      } else if (conditionType==='field_equals') {
        const fieldName = node.data?.conditionField
        condResult = !!fieldName && String(contact[fieldName] ?? '') === String(node.data?.conditionValue ?? '')
      } else if (conditionType==='replied') {
        condResult = db.data.inboxThreads.some(t =>
          t.workspaceId===a.workspaceId &&
          t.messages.some(m => m.direction==='in' && m.fromEmail?.toLowerCase()===contact.email.toLowerCase() && m.time > enrollment.enrolledAt)
        )
      } else condResult=false
    }

    const outEdges=a.edges.filter(e=>e.source===node.id)
    let nextEdge
    if (condResult!==undefined) nextEdge=outEdges.find(e=>e.sourceHandle===(condResult?'yes':'no'))||outEdges[0]
    else nextEdge=outEdges[0]

    if (!nextEdge) {
      enrollment.status='completed'
    } else {
      const nextNode=a.nodes.find(n=>n.id===nextEdge.target)
      enrollment.currentNodeId=nextEdge.target
      if (nextNode?.type==='delay') {
        enrollment.nextRunAt=new Date(Date.now()+getDelayMs(nextNode.data)).toISOString()
        const afterDelay=a.edges.find(e=>e.source===nextNode.id)
        if (afterDelay) enrollment.currentNodeId=afterDelay.target
      } else {
        enrollment.nextRunAt=new Date(Date.now()+2000).toISOString() // run next cycle
      }
    }
  }
  await db.write()
}

// Automation engine timers are started from startup(), after the initial db.read()
// completes — see bottom of file. Scheduling them at module load (before data exists)
// was safe with the instant local JSON read but races with Supabase's network round-trip.

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

const settR = express.Router()
settR.use(requireAuth, requireWorkspace)

settR.get('/profile', (req, res) => {
  const { id, email, name, role, bio, defaultSenderName } = req.user
  res.json({ id, email, name, role, bio: bio || '', defaultSenderName: defaultSenderName || name || '' })
})

settR.put('/profile', async (req, res) => {
  const { name, email, bio, defaultSenderName } = req.body
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'name and email are required.' })
  const newEmail = email.toLowerCase().trim()
  if (newEmail !== req.user.email.toLowerCase()) {
    if (db.data.users.find(u => u.id !== req.user.id && u.email.toLowerCase() === newEmail))
      return res.status(409).json({ error: 'Email already in use.' })
  }
  req.user.name = name.trim()
  req.user.email = newEmail
  req.user.bio = (bio || '').trim()
  req.user.defaultSenderName = (defaultSenderName || name).trim()
  await db.write()
  res.json({ ok: true, name: req.user.name, email: req.user.email })
})

settR.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required.' })
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' })
  if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ error: 'New password must contain an uppercase letter.' })
  if (!/[a-z]/.test(newPassword)) return res.status(400).json({ error: 'New password must contain a lowercase letter.' })
  if (!/[0-9]/.test(newPassword)) return res.status(400).json({ error: 'New password must contain a number.' })
  if (!/[^A-Za-z0-9]/.test(newPassword)) return res.status(400).json({ error: 'New password must contain a special character.' })
  const ok = await bcrypt.compare(currentPassword, req.user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' })
  req.user.passwordHash = await bcrypt.hash(newPassword, 12)
  await db.write()
  res.json({ ok: true })
})

settR.get('/notification-prefs', (req, res) => {
  res.json(req.user.notificationPrefs || {
    opens: true, clicks: false, replies: true, bounces: true,
    unsubscribes: false, weeklyReport: true, campaignComplete: true,
  })
})

settR.put('/notification-prefs', async (req, res) => {
  req.user.notificationPrefs = { ...req.body }
  await db.write()
  res.json({ ok: true })
})

settR.get('/sending-defaults', (req, res) => {
  res.json(req.user.sendingDefaults || {
    defaultAccountId: null,
    dailyLimit: 100,
    windowStart: '08:00',
    windowEnd: '18:00',
    timezone: 'UTC+5:00 — Karachi / Islamabad',
    unsubscribeFooter: 'You are receiving this because you opted in. Click here to unsubscribe.',
  })
})

settR.put('/sending-defaults', async (req, res) => {
  req.user.sendingDefaults = { ...req.body }
  await db.write()
  res.json({ ok: true })
})

settR.get('/api-keys', (req, res) => {
  const keys = (db.data.apiKeys || []).filter(k => k.workspaceId === req.workspace.id)
  res.json(keys.map(({ keyHash, ...k }) => k))
})

settR.post('/api-keys', async (req, res) => {
  const { name, scopes } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required.' })
  const rawKey = `eit_live_${crypto.randomBytes(24).toString('base64url')}`
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 18)
  const record = {
    id: nextId('apiKeys'),
    workspaceId: req.workspace.id,
    createdByUserId: req.user.id,
    name: name.trim(),
    keyPrefix,
    keyHash,
    scopes: scopes || [],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }
  db.data.apiKeys.push(record)
  await db.write()
  const { keyHash: _, ...safe } = record
  res.json({ ...safe, fullKey: rawKey })
})

settR.delete('/api-keys/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  const key = (db.data.apiKeys || []).find(k => k.id === id && k.workspaceId === req.workspace.id)
  if (!key) return res.status(404).json({ error: 'Not found' })
  db.data.apiKeys = db.data.apiKeys.filter(k => k.id !== id)
  await db.write()
  res.json({ ok: true })
})

app.use('/api/settings', settR)

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONAL EMAIL API — lets external code (a signup form, checkout flow,
// password-reset handler, etc.) send a single email outside the campaign or
// automation flow, authenticated by a workspace API key (managed under
// Settings) rather than a logged-in session. Mirrors Brevo's transactional
// email API in shape: POST to send, GET to see recent send history.
// ═══════════════════════════════════════════════════════════════════════════════

async function requireApiKey(req, res, next) {
  const provided = req.header('api-key') || (req.header('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!provided) return res.status(401).json({ error: 'Missing API key. Pass it in the "api-key" header.' })
  const keyHash = crypto.createHash('sha256').update(provided).digest('hex')
  const key = (db.data.apiKeys || []).find(k => k.keyHash === keyHash)
  if (!key) return res.status(401).json({ error: 'Invalid API key.' })
  const workspace = db.data.workspaces.find(w => w.id === key.workspaceId)
  if (!workspace) return res.status(401).json({ error: 'The workspace for this API key no longer exists.' })
  key.lastUsedAt = new Date().toISOString()
  req.workspace = workspace
  req.apiKey = key
  next()
}

const txR = express.Router()
txR.use(requireApiKey, requirePlanActive)

txR.post('/send', async (req, res) => {
  const { to, subject, htmlBody, text, fromAccountId, replyTo } = req.body
  if (!to || !subject || !(htmlBody || text))
    return res.status(400).json({ error: 'to, subject, and htmlBody (or text) are required.' })
  const limitErr = checkEmailLimit(1, req.workspace.id, req.planInfo)
  if (limitErr) return res.status(403).json(limitErr)

  const accounts = db.data.emailAccounts.filter(a => a.workspaceId === req.workspace.id)
  const account = (fromAccountId ? accounts.find(a => a.id === fromAccountId) : null)
    || accounts.find(a => a.status === 'connected') || accounts[0]
  if (!account) return res.status(400).json({ error: 'No email account configured for this workspace.' })
  if (!account.smtpPass) return res.status(400).json({ error: 'SMTP password missing on the selected sending account.' })

  const log = {
    id: nextId('transactionalEmails'), workspaceId: req.workspace.id, apiKeyId: req.apiKey.id,
    to, subject, status: 'pending', error: null, createdAt: new Date().toISOString(), sentAt: null,
  }
  db.data.transactionalEmails.push(log)
  await db.write()

  try {
    const transport = makeTransport(account)
    await transport.sendMail({
      from: `"${account.fromName || account.name}" <${account.email}>`,
      to, replyTo: replyTo || undefined, subject,
      html: htmlBody || undefined, text: text || undefined,
    })
    log.status = 'sent'; log.sentAt = new Date().toISOString()
    account.sentToday = (account.sentToday || 0) + 1
    account.totalSent = (account.totalSent || 0) + 1
  } catch (e) {
    log.status = 'failed'; log.error = e.message
  }
  await db.write()
  res.status(log.status === 'sent' ? 200 : 502).json({ id: log.id, status: log.status, error: log.error })
})

txR.get('/logs', (req, res) => {
  const logs = (db.data.transactionalEmails || [])
    .filter(l => l.workspaceId === req.workspace.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 200)
  res.json(logs)
})

app.use('/api/v1', txR)

// Session-authenticated mirror of the log endpoint above, so the Settings UI
// can show recent transactional sends without needing an API key of its own.
const txLogR = express.Router()
txLogR.use(requireAuth, requireWorkspace)
txLogR.get('/', (req, res) => {
  const logs = (db.data.transactionalEmails || [])
    .filter(l => l.workspaceId === req.workspace.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 200)
  res.json(logs)
})
app.use('/api/transactional-logs', txLogR)

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const notifR = express.Router()
notifR.use(requireAuth, requireWorkspace)

notifR.get('/', (req, res) => {
  const notifs = (db.data.notifications || []).filter(n => n.workspaceId === req.workspace.id).slice().reverse().slice(0, 50)
  res.json(notifs)
})

notifR.patch('/:id/read', async (req, res) => {
  const n = (db.data.notifications || []).find(n => n.id === parseInt(req.params.id) && n.workspaceId === req.workspace.id)
  if (!n) return res.status(404).json({ error: 'Not found' })
  n.read = true; await db.write(); res.json({ ok: true })
})

notifR.post('/mark-all-read', async (req, res) => {
  ;(db.data.notifications || []).filter(n => n.workspaceId === req.workspace.id).forEach(n => { n.read = true })
  await db.write(); res.json({ ok: true })
})

notifR.delete('/:id', async (req, res) => {
  db.data.notifications = (db.data.notifications || []).filter(n => !(n.id === parseInt(req.params.id) && n.workspaceId === req.workspace.id))
  await db.write(); res.json({ ok: true })
})

app.use('/api/notifications', notifR)

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING
// ═══════════════════════════════════════════════════════════════════════════════

const billingR = express.Router()
billingR.use(requireAuth, requireWorkspace)

// GET /api/billing/plans — public plan catalogue
billingR.get('/plans', (_req, res) => {
  res.json(Object.values(PLANS))
})

// GET /api/billing/status — current workspace's plan + live usage
billingR.get('/status', (req, res) => {
  const workspace     = req.workspace
  const plan          = getWorkspacePlan(workspace)
  const contactCount  = db.data.contacts.filter(c => c.workspaceId === workspace.id).length
  const emailsUsed    = getEmailsThisCycle(workspace.id)
  res.json({
    plan:      workspace.plan || 'free_trial',
    planName:  plan.name,
    price:     plan.price,
    interval:  plan.interval,
    expired:   plan.expired || false,
    trialEnd:  plan.trialEnd   || null,
    daysLeft:  plan.daysLeft   ?? null,
    planStartedAt:     workspace.planStartedAt     || null,
    billingCycleStart: workspace.billingCycleStart || null,
    contacts:  { used: contactCount, limit: plan.maxContacts },
    emails:    { used: emailsUsed,   limit: plan.maxEmailsPerMonth },
  })
})

// POST /api/billing/upgrade — upgrade / purchase a plan (workspace owner only)
// In production: replace the paymentToken stub with real Stripe PaymentIntent verification.
billingR.post('/upgrade', async (req, res) => {
  if (req.workspaceRole !== 'owner')
    return res.status(403).json({ error: 'Only the workspace owner can change the plan.' })

  const { plan: planId, paymentToken } = req.body

  if (!['pro', 'max', 'agency'].includes(planId))
    return res.status(400).json({ error: 'Invalid plan. Must be pro, max, or agency.' })

  if (!paymentToken || typeof paymentToken !== 'string' || paymentToken.trim().length < 8)
    return res.status(400).json({ error: 'Payment token is required.' })

  // ── Payment verification ──────────────────────────────────────────────────
  // PRODUCTION: verify with Stripe
  //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  //   const intent = await stripe.paymentIntents.retrieve(paymentToken)
  //   if (intent.status !== 'succeeded')
  //     return res.status(402).json({ error: 'Payment not confirmed.' })
  //   if (intent.metadata.plan !== planId)
  //     return res.status(400).json({ error: 'Plan mismatch.' })
  //
  // DEMO: accept tokens prefixed with "demo_pay_" for testing only.
  const isDev = process.env.NODE_ENV !== 'production'
  if (!isDev && !paymentToken.startsWith('pi_')) {
    return res.status(402).json({ error: 'Invalid payment token.' })
  }
  if (isDev && !paymentToken.startsWith('demo_pay_') && !paymentToken.startsWith('pi_')) {
    return res.status(402).json({ error: 'Demo token must start with demo_pay_' })
  }
  // ─────────────────────────────────────────────────────────────────────────

  const now = new Date().toISOString()
  req.workspace.plan              = planId
  req.workspace.planStartedAt     = now
  req.workspace.billingCycleStart = now
  await db.write()

  pushNotif(req.workspace.id, 'billing', `Upgraded to ${PLANS[planId].name}!`,
    `"${req.workspace.name}" is now on the ${PLANS[planId].name} plan. Enjoy your new limits.`,
    { label: 'View billing', href: '/settings?tab=billing' }
  )

  res.json({ ok: true, plan: planId, planName: PLANS[planId].name })
})

// POST /api/billing/admin/set-plan — dev/admin override (not callable in production)
billingR.post('/admin/set-plan', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ error: 'Not available in production.' })
  if (req.user.role !== 'owner')
    return res.status(403).json({ error: 'Owner only.' })

  const { plan: planId } = req.body
  if (!PLANS[planId]) return res.status(400).json({ error: 'Unknown plan.' })

  req.workspace.plan              = planId
  req.workspace.planStartedAt     = new Date().toISOString()
  req.workspace.billingCycleStart = new Date().toISOString()
  if (planId === 'free_trial') req.workspace.trialStartedAt = new Date().toISOString()
  await db.write()
  res.json({ ok: true, plan: planId })
})

app.use('/api/billing', billingR)

// ═══════════════════════════════════════════════════════════════════════════════
// REFERRAL PROGRAM
// ═══════════════════════════════════════════════════════════════════════════════

const referralR = express.Router()
referralR.use(requireAuth, requireWorkspace)

referralR.get('/', async (req, res) => {
  const ws = req.workspace
  const codeAlreadyExisted = !!ws.referralCode
  const code = getOrCreateReferralCode(ws)
  if (!codeAlreadyExisted) await db.write()
  const referrals = db.data.referrals.filter(r => r.referrerWorkspaceId === ws.id)
  res.json({
    code,
    link: `${FRONTEND}/signup?ref=${code}`,
    bonusDays: REFERRAL_BONUS_DAYS,
    referredCount: referrals.length,
    bonusDaysEarned: referrals.reduce((sum, r) => sum + r.bonusDays, 0),
  })
})

app.use('/api/referral', referralR)

// Catches Multer errors (oversized file, too many files) so attachment uploads
// fail with a clean JSON message instead of Express's default HTML 500.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Attachment too large (max 10MB per file).'
      : err.code === 'LIMIT_FILE_COUNT' ? 'Too many attachments (max 5 files).'
      : err.message
    return res.status(400).json({ error: msg })
  }
  next(err)
})

// ─── Serve built frontend in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, 'dist')
  app.use(express.static(distPath, { maxAge: '1d', etag: true }))
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ─── Startup (all awaits must live here — Phusion Passenger blocks top-level await) ───
async function startup() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { SupabaseAdapter } = await import('./db-adapter.mjs')
      db = new Low(new SupabaseAdapter(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY), {})
      console.log('Database: Supabase')
    } catch (e) {
      dbInitError = e.stack || e.message
      console.error('Supabase adapter failed to load, falling back to local JSON file:', e)
    }
  }
  if (!db) {
    const dataDir = join(__dirname, 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    db = new Low(new JSONFile(join(dataDir, 'db.json')), {})
    console.log('Database: local JSON file' + (dbInitError ? ' (Supabase failed — see /api/debug-db-error)' : ' (set SUPABASE_URL + SUPABASE_SERVICE_KEY to use Supabase)'))
  }

  await db.read()
  db.data = {
    users:                [],
    resetTokens:          [],
    emailAccounts:        [],
    domains:              [],
    contacts:             [],
    templates:            [],
    campaigns:            [],
    campaignRecipients:   [],
    automations:          [],
    automationEnrollments:[],
    inboxThreads:         [],
    notifications:        [],
    apiKeys:              [],
    verificationTokens:   [],
    workspaces:           [],
    workspaceMembers:     [],
    workspaceInvites:     [],
    forms:                [],
    landingPages:         [],
    segments:             [],
    transactionalEmails:  [],
    referrals:            [],
    ...db.data,
  }

  // Seed admin
  if (!db.data.users.find(u => u.email === ADMIN_EMAIL)) {
    db.data.users.push({
      id: 1, email: ADMIN_EMAIL, name: 'Saqlain',
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'owner', createdAt: new Date().toISOString(), emailVerified: true,
    })
    console.log('Admin seeded:', ADMIN_EMAIL)
  }

  // Migration: workspaces didn't exist before this version — plan/trial/billing
  // fields used to live on the user record. Give every user who has no
  // workspace membership yet a "Personal" workspace, carrying over their old
  // plan fields if present so nobody's plan silently resets.
  let migratedWorkspaces = false
  let legacyWorkspaceId  = null
  for (const u of db.data.users) {
    const hasMembership = db.data.workspaceMembers.some(m => m.userId === u.id)
    if (hasMembership) continue
    const workspace = createWorkspaceForUser(u, `${u.name}'s Workspace`)
    if (u.plan) {
      workspace.plan              = u.plan
      workspace.trialStartedAt    = u.trialStartedAt    || workspace.trialStartedAt
      workspace.billingCycleStart = u.billingCycleStart || workspace.billingCycleStart
    } else if (u.role === 'owner') {
      workspace.plan = 'agency'
    }
    delete u.plan; delete u.trialStartedAt; delete u.billingCycleStart; delete u.planStartedAt
    if (!legacyWorkspaceId || u.role === 'owner') legacyWorkspaceId = workspace.id
    migratedWorkspaces = true
  }

  // Migration: any pre-workspace data (contacts, campaigns, etc. with no
  // workspaceId) gets assigned to the owner's workspace — before workspaces
  // existed, all data was implicitly single-tenant.
  if (legacyWorkspaceId) {
    const scopedCollections = [
      'contacts', 'campaigns', 'domains', 'emailAccounts', 'templates',
      'automations', 'inboxThreads', 'notifications', 'apiKeys',
    ]
    for (const key of scopedCollections) {
      for (const record of db.data[key]) {
        if (!record.workspaceId) { record.workspaceId = legacyWorkspaceId; migratedWorkspaces = true }
      }
    }
    // campaignRecipients / automationEnrollments are scoped indirectly via
    // their parent campaign/automation, but stamp them directly too for
    // simpler/faster queries.
    const campaignWs = new Map(db.data.campaigns.map(c => [c.id, c.workspaceId]))
    for (const r of db.data.campaignRecipients) {
      if (!r.workspaceId && campaignWs.has(r.campaignId)) { r.workspaceId = campaignWs.get(r.campaignId); migratedWorkspaces = true }
    }
    const automationWs = new Map(db.data.automations.map(a => [a.id, a.workspaceId]))
    for (const e of db.data.automationEnrollments) {
      if (!e.workspaceId && automationWs.has(e.automationId)) { e.workspaceId = automationWs.get(e.automationId); migratedWorkspaces = true }
    }
  }

  await db.write()
  if (migratedWorkspaces) console.log('Workspaces migration applied')

  app.listen(PORT, () => {
    console.log(`KeepMailing running on port ${PORT}`)
    console.log(`Admin: ${ADMIN_EMAIL}`)
  })

  // Automation engine: safe to start now that the initial db.read() has completed.
  setInterval(() => processAutomations().catch(console.error), 60000)
  setTimeout(() => processAutomations().catch(console.error), 5000)

  // A/B test winner picker: same reasoning as above — must start after read().
  setInterval(() => processAbTests().catch(console.error), 60000)
  setTimeout(() => processAbTests().catch(console.error), 5000)

  // Inbox auto-sync: same reasoning as above — must start after read().
  setInterval(() => processInboxSync().catch(console.error), 60000)
  setTimeout(() => processInboxSync().catch(console.error), 10000)
}

startup().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
