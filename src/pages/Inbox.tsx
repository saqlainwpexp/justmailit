import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Search, Star, Reply, Forward, Paperclip, Send, ChevronDown,
  Archive, Trash2, Plus, X, MoreHorizontal, RefreshCw,
  Inbox as InboxIcon, Mail, Check, Loader2, AlertCircle, Wifi, WifiOff,
} from 'lucide-react'
import { cn, timeAgo } from '../lib/utils'
import { useData, apiFetch } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  fromName: string
  fromEmail: string
  direction: 'in' | 'out'
  body: string
  time: string
  inReplyTo: string | null
  attachmentNames?: string[]
}

interface Thread {
  id: number
  accountId: number
  subject: string
  messages: Message[]
  read: boolean
  starred: boolean
  archived: boolean
  labels: string[]
  hasAttachment: boolean
  lastMessageAt: string
}

interface Account {
  id: number
  name: string
  email: string
  fromName: string
  status: string
  color: string
}

type Folder     = 'inbox' | 'starred' | 'sent' | 'archive'
type FilterMode = 'all' | 'unread' | 'starred'

const LABEL_STYLES: Record<string, string> = {
  'warm-lead': 'bg-green-100 text-green-700',
  'cold':      'bg-blue-100 text-blue-700',
  'vip':       'bg-amber-100 text-amber-700',
  'follow-up': 'bg-purple-100 text-purple-700',
}

const FOLDERS: { id: Folder; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'inbox',   label: 'Inbox',   icon: InboxIcon },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'sent',    label: 'Sent',    icon: Send },
  { id: 'archive', label: 'Archive', icon: Archive },
]

const AVATAR_COLORS = ['bg-forest','bg-purple-600','bg-blue-600','bg-amber-600','bg-coral','bg-pink-600','bg-teal-600']
function avatarColor(str: string) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string) { return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

function threadFrom(t: Thread): string {
  const last = [...t.messages].reverse()
  const inbound = last.find(m => m.direction === 'in')
  return inbound?.fromName || t.messages[0]?.fromName || '?'
}
function threadPreview(t: Thread): string {
  const last = t.messages[t.messages.length - 1]
  if (!last) return ''
  return (last.direction === 'out' ? 'You: ' : '') + last.body.replace(/\n+/g, ' ')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [activeFolder,    setActiveFolder]    = useState<Folder>('inbox')
  const [activeAccountId, setActiveAccountId] = useState<number | 'all'>('all')
  const [search,          setSearch]          = useState('')
  const [filterMode,      setFilterMode]      = useState<FilterMode>('all')
  const [selectedThread,  setSelectedThread]  = useState<Thread | null>(null)
  const [replyText,       setReplyText]       = useState('')
  const [replyAccountId,  setReplyAccountId]  = useState<number | null>(null)
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [showMoreMenu,    setShowMoreMenu]    = useState(false)
  const [showCompose,     setShowCompose]     = useState(false)
  const [compose, setCompose]                 = useState({ to: '', fromAccountId: 0, subject: '', body: '' })
  const [syncing,         setSyncing]         = useState(false)
  const [syncMsg,         setSyncMsg]         = useState<string | null>(null)
  const [sending,         setSending]         = useState(false)
  const [sendError,       setSendError]       = useState<string | null>(null)
  const [localThreads,    setLocalThreads]    = useState<Thread[]>([])
  const [replyFiles,      setReplyFiles]      = useState<File[]>([])
  const [composeFiles,    setComposeFiles]    = useState<File[]>([])

  const moreMenuRef      = useRef<HTMLDivElement>(null)
  const accountPickerRef = useRef<HTMLDivElement>(null)
  const replyFileRef     = useRef<HTMLInputElement>(null)
  const composeFileRef   = useRef<HTMLInputElement>(null)

  const MAX_ATTACHMENTS = 5
  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>, current: File[], setFiles: (f: File[]) => void) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    const oversized = picked.find(f => f.size > MAX_ATTACHMENT_SIZE)
    if (oversized) { setSendError(`"${oversized.name}" is too large (max 10MB per file).`); return }
    const combined = [...current, ...picked].slice(0, MAX_ATTACHMENTS)
    setFiles(combined)
  }

  const qs = new URLSearchParams({
    folder: activeFolder,
    ...(activeAccountId !== 'all' ? { accountId: String(activeAccountId) } : {}),
    ...(search ? { search } : {}),
  }).toString()

  const { data: rawThreads, loading: threadsLoading, reload } = useData<Thread[]>(`/api/inbox/threads?${qs}`)
  const { data: accountsRaw, loading: accountsLoading }       = useData<Account[]>('/api/accounts')

  const accounts = accountsRaw || []

  // Merge local overrides (optimistic updates) with server data
  useEffect(() => {
    setLocalThreads(rawThreads || [])
  }, [rawThreads])

  // Auto-set compose from-account to first account
  useEffect(() => {
    if (accounts.length > 0 && compose.fromAccountId === 0) {
      const first = accounts.find(a => a.status === 'connected') || accounts[0]
      setCompose(p => ({ ...p, fromAccountId: first.id }))
    }
  }, [accounts])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false)
      if (accountPickerRef.current && !accountPickerRef.current.contains(e.target as Node)) setShowAccountPicker(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const folderCounts = useMemo(() => ({
    inbox:   localThreads.filter(t => !t.archived && !t.read).length,
    starred: localThreads.filter(t => t.starred).length,
    sent:    localThreads.filter(t => t.messages.some(m => m.direction === 'out')).length,
    archive: localThreads.filter(t => t.archived).length,
  }), [localThreads])

  // Patch thread locally + on server
  const patchThread = async (id: number, patch: Partial<Thread>) => {
    setLocalThreads(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
    if (selectedThread?.id === id) setSelectedThread(p => p ? { ...p, ...patch } : null)
    await apiFetch(`/api/inbox/threads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {})
  }

  const selectThread = (t: Thread) => {
    setSelectedThread(t)
    setShowMoreMenu(false)
    setReplyText('')
    setReplyFiles([])
    setSendError(null)
    const acct = accounts.find(a => a.id === t.accountId)
    if (acct) setReplyAccountId(acct.id)
    if (!t.read) patchThread(t.id, { read: true })
  }

  const archiveThread = async (id: number) => {
    await patchThread(id, { archived: true })
    if (selectedThread?.id === id) { setSelectedThread(null); setShowMoreMenu(false) }
  }

  const deleteThread = async (id: number) => {
    setLocalThreads(ts => ts.filter(t => t.id !== id))
    if (selectedThread?.id === id) { setSelectedThread(null); setShowMoreMenu(false) }
    await apiFetch(`/api/inbox/threads/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  // apiFetch always forces a JSON content-type header, which breaks multipart
  // uploads (the browser needs to set its own boundary) — so attachment sends
  // go through raw fetch with FormData instead.
  async function sendMultipart<T>(url: string, fields: Record<string, string>, files: File[]): Promise<T> {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    for (const f of files) form.append('attachments', f)
    const res = await fetch(url, { method: 'POST', credentials: 'include', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`)
    return data as T
  }

  const sendReply = async () => {
    if (!selectedThread || !replyText.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const fields = { body: replyText, fromAccountId: String(replyAccountId || selectedThread.accountId) }
      const msg = replyFiles.length
        ? await sendMultipart<Message>(`/api/inbox/threads/${selectedThread.id}/reply`, fields, replyFiles)
        : await apiFetch<Message>(`/api/inbox/threads/${selectedThread.id}/reply`, { method: 'POST', body: JSON.stringify(fields) })
      const updated = { ...selectedThread, messages: [...selectedThread.messages, msg] }
      setLocalThreads(ts => ts.map(t => t.id === selectedThread.id ? updated : t))
      setSelectedThread(updated)
      setReplyText('')
      setReplyFiles([])
    } catch(e: any) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  const sendCompose = async () => {
    if (!compose.to || !compose.subject || !compose.body) return
    setSending(true)
    setSendError(null)
    try {
      const fields = { to: compose.to, subject: compose.subject, body: compose.body, fromAccountId: String(compose.fromAccountId) }
      const thread = composeFiles.length
        ? await sendMultipart<Thread>('/api/inbox/compose', fields, composeFiles)
        : await apiFetch<Thread>('/api/inbox/compose', { method: 'POST', body: JSON.stringify(fields) })
      setLocalThreads(ts => [thread, ...ts])
      setShowCompose(false)
      setCompose(p => ({ ...p, to: '', subject: '', body: '' }))
      setComposeFiles([])
    } catch(e: any) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>('/api/inbox/sync', { method: 'POST' })
      setSyncMsg(r.message)
      setTimeout(() => { reload(); setSyncMsg(null) }, 4000)
    } catch(e: any) {
      setSyncMsg(e.message)
    } finally {
      setSyncing(false)
    }
  }

  const replyAccount = accounts.find(a => a.id === replyAccountId)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Unified Inbox</h1>
          <p className="page-subtitle">All your email accounts in one place</p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && <span className="text-xs text-sage-500 mr-1">{syncMsg}</span>}
          <button onClick={doSync} disabled={syncing} className="btn-ghost text-xs px-3 py-2 disabled:opacity-60">
            <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button onClick={() => { setSendError(null); setShowCompose(true) }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Compose
          </button>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[540px]">

        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <div className="w-48 shrink-0 space-y-4">
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-sage-400 uppercase tracking-wider px-3 mb-2">Folders</p>
            {FOLDERS.map(f => {
              const Icon  = f.icon
              const count = folderCounts[f.id]
              return (
                <button
                  key={f.id}
                  onClick={() => { setActiveFolder(f.id); setSelectedThread(null) }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    activeFolder === f.id ? 'bg-lime-active text-forest' : 'text-sage-600 hover:bg-white hover:shadow-card'
                  )}
                >
                  <span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{f.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      'shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] flex items-center justify-center px-1',
                      activeFolder === f.id ? 'bg-forest text-white' : 'bg-sage-200 text-sage-600'
                    )}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-sage-400 uppercase tracking-wider px-3 mb-2">Accounts</p>

            <button
              onClick={() => setActiveAccountId('all')}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                activeAccountId === 'all' ? 'bg-lime-active text-forest' : 'text-sage-600 hover:bg-white hover:shadow-card'
              )}
            >
              <span>All inboxes</span>
            </button>

            {accountsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-sage-400">
                <Loader2 className="w-3 h-3 animate-spin" />Loading…
              </div>
            ) : accounts.length === 0 ? (
              <p className="px-3 text-[10px] text-sage-400">No accounts yet</p>
            ) : accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setActiveAccountId(a.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate',
                  activeAccountId === a.id ? 'bg-lime-active text-forest' : 'text-sage-600 hover:bg-white hover:shadow-card'
                )}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color || '#2d5a3d' }} />
                <span className="truncate">{a.email}</span>
                {a.status !== 'connected' && <WifiOff className="w-2.5 h-2.5 text-red-400 shrink-0 ml-auto" />}
              </button>
            ))}
          </div>
        </div>

        {/* ── Thread list ──────────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 bg-white rounded-xl border border-sage-100 shadow-card flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-sage-100 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-sage-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="input pl-8 py-2 text-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-sage-400 hover:text-sage-700" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'unread', 'starred'] as FilterMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setFilterMode(m)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize transition-colors',
                    filterMode === m ? 'bg-forest text-white' : 'bg-sage-100 text-sage-500 hover:bg-sage-200'
                  )}
                >{m}</button>
              ))}
              <span className="ml-auto text-[10px] text-sage-400">{localThreads.length}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-sage-50">
            {threadsLoading ? (
              <div className="flex items-center justify-center gap-2 h-32 text-xs text-sage-400">
                <Loader2 className="w-4 h-4 animate-spin" />Loading…
              </div>
            ) : localThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-12">
                <Mail className="w-10 h-10 text-sage-200" />
                <p className="text-sm font-medium text-sage-400">No messages</p>
                <p className="text-xs text-sage-300">
                  {accounts.length === 0
                    ? 'Add an email account first, then sync.'
                    : 'Click Sync to fetch emails from your accounts.'}
                </p>
                {accounts.length > 0 && (
                  <button onClick={doSync} disabled={syncing} className="btn-secondary text-xs mt-1">
                    <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
                    Sync now
                  </button>
                )}
              </div>
            ) : (
              (() => {
                let list = localThreads
                if (filterMode === 'unread')  list = list.filter(t => !t.read)
                if (filterMode === 'starred') list = list.filter(t => t.starred)
                return list.map(t => {
                  const sender   = threadFrom(t)
                  const acctColor = accounts.find(a => a.id === t.accountId)?.color
                  const av = initials(sender)
                  return (
                    <div
                      key={t.id}
                      onClick={() => selectThread(t)}
                      className={cn(
                        'relative group px-4 py-3.5 hover:bg-sage-50 transition-colors cursor-pointer',
                        selectedThread?.id === t.id ? 'bg-sage-50 border-l-2 border-l-forest' : ''
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white', avatarColor(sender))}
                          style={acctColor ? { background: acctColor } : undefined}>
                          {av}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={cn('text-xs truncate', !t.read ? 'font-semibold text-forest' : 'font-medium text-sage-700')}>
                              {sender}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-sage-400">{timeAgo(t.lastMessageAt)}</span>
                              {t.hasAttachment && <Paperclip className="w-2.5 h-2.5 text-sage-300" />}
                            </div>
                          </div>
                          <p className={cn('text-xs truncate', !t.read ? 'font-medium text-sage-800' : 'text-sage-600')}>{t.subject}</p>
                          <p className="text-[10px] text-sage-400 truncate mt-0.5">{threadPreview(t)}</p>
                          <div className="flex items-center justify-between mt-1.5 gap-1">
                            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                              <span className="text-[9px] text-sage-400 bg-sage-100 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[80px]">
                                {accounts.find(a => a.id === t.accountId)?.email || `account ${t.accountId}`}
                              </span>
                              {t.labels.slice(0, 1).map(l => (
                                <span key={l} className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0', LABEL_STYLES[l] || 'bg-sage-100 text-sage-500')}>{l}</span>
                              ))}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); patchThread(t.id, { starred: !t.starred }) }}
                                className={cn('w-5 h-5 rounded flex items-center justify-center transition-all', t.starred ? '' : 'opacity-0 group-hover:opacity-100')}
                              >
                                <Star className={cn('w-3 h-3', t.starred ? 'fill-amber-400 text-amber-400' : 'text-sage-300 hover:text-amber-400')} />
                              </button>
                              {!t.read && <div className="w-1.5 h-1.5 rounded-full bg-forest" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              })()
            )}
          </div>
        </div>

        {/* ── Thread view ──────────────────────────────────────────────────── */}
        {selectedThread ? (
          <div className="flex-1 bg-white rounded-xl border border-sage-100 shadow-card flex flex-col overflow-hidden min-w-0">
            <div className="px-5 py-3.5 border-b border-sage-100 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-forest truncate">{selectedThread.subject}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] text-sage-400">
                    {selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? 's' : ''}
                  </span>
                  {selectedThread.labels.map(l => (
                    <span key={l} className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', LABEL_STYLES[l] || 'bg-sage-100 text-sage-500')}>{l}</span>
                  ))}
                  {selectedThread.hasAttachment && (
                    <span className="text-[9px] text-sage-400 flex items-center gap-1"><Paperclip className="w-2.5 h-2.5" /> Attachment</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => patchThread(selectedThread.id, { starred: !selectedThread.starred })}
                  className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors"
                >
                  <Star className={cn('w-4 h-4', selectedThread.starred ? 'fill-amber-400 text-amber-400' : 'text-sage-400')} />
                </button>
                <button className="btn-ghost text-xs px-2.5 py-1.5 gap-1.5">
                  <Reply className="w-3.5 h-3.5" />Reply
                </button>
                <button className="btn-ghost text-xs px-2.5 py-1.5 gap-1.5">
                  <Forward className="w-3.5 h-3.5" />Forward
                </button>
                <button
                  onClick={() => archiveThread(selectedThread.id)}
                  className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors"
                >
                  <Archive className="w-4 h-4 text-sage-400" />
                </button>
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setShowMoreMenu(p => !p)}
                    className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4 text-sage-400" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-sage-100 rounded-xl shadow-card-hover z-20 py-1 min-w-[168px]">
                      {[
                        { label: 'Mark as unread', icon: Mail,    action: () => { patchThread(selectedThread.id, { read: false }); setShowMoreMenu(false) } },
                        { label: 'Archive',         icon: Archive, action: () => archiveThread(selectedThread.id) },
                        { label: 'Delete',          icon: Trash2,  action: () => deleteThread(selectedThread.id), red: true },
                      ].map(item => (
                        <button key={item.label} onClick={item.action}
                          className={cn('w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium hover:bg-sage-50 transition-colors text-left', item.red ? 'text-red-500 hover:bg-red-50' : 'text-sage-700')}
                        >
                          <item.icon className="w-3.5 h-3.5" />{item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {selectedThread.messages.map(msg => {
                const isOut = msg.direction === 'out'
                const av    = isOut ? initials(msg.fromName || 'You') : initials(threadFrom(selectedThread))
                return (
                  <div key={msg.id} className={cn('flex gap-3', isOut ? 'flex-row-reverse' : '')}>
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white', isOut ? 'bg-forest' : avatarColor(msg.fromName))}>
                      {av}
                    </div>
                    <div className={cn('max-w-[78%] flex flex-col', isOut ? 'items-end' : 'items-start')}>
                      <div className={cn('flex items-center gap-2 mb-1.5 flex-wrap', isOut ? 'flex-row-reverse' : '')}>
                        <span className="text-[11px] font-semibold text-forest">{msg.fromName}</span>
                        <span className="text-[10px] text-sage-400">&lt;{msg.fromEmail}&gt;</span>
                        <span className="text-[10px] text-sage-400">{timeAgo(msg.time)}</span>
                      </div>
                      <div className={cn(
                        'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                        isOut ? 'bg-forest text-white rounded-tr-sm' : 'bg-sage-50 text-sage-800 border border-sage-100 rounded-tl-sm'
                      )}>
                        {msg.body}
                      </div>
                      {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                        <div className={cn('flex flex-wrap gap-1.5 mt-1.5', isOut ? 'justify-end' : 'justify-start')}>
                          {msg.attachmentNames.map((name, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-sage-100 text-sage-600 rounded-full px-2 py-0.5">
                              <Paperclip className="w-2.5 h-2.5" />{name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-sage-100 p-4 shrink-0">
              {sendError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 text-xs text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{sendError}
                </div>
              )}
              <div className="border border-sage-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-sage-100 bg-sage-50/70">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-sage-400 shrink-0">From:</span>
                    <div className="relative" ref={accountPickerRef}>
                      <button
                        onClick={() => setShowAccountPicker(p => !p)}
                        className="flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                      >
                        {replyAccount?.email || 'Select account'}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showAccountPicker && accounts.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 bg-white border border-sage-100 rounded-xl shadow-card-hover z-20 py-1 min-w-[210px]">
                          {accounts.map(a => (
                            <button key={a.id}
                              onClick={() => { setReplyAccountId(a.id); setShowAccountPicker(false) }}
                              className="w-full flex items-center justify-between px-3.5 py-2 text-xs hover:bg-sage-50 transition-colors"
                            >
                              <span className="text-sage-700">{a.email}</span>
                              {replyAccountId === a.id && <Check className="w-3 h-3 text-forest" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-sage-400 truncate ml-4">
                    To: {[...selectedThread.messages].reverse().find(m => m.direction === 'in')?.fromEmail ?? ''}
                  </span>
                </div>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write your reply…"
                  rows={4}
                  className="w-full px-4 py-3 text-sm text-sage-800 placeholder:text-sage-400 resize-none focus:outline-none"
                />
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                    {replyFiles.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-sage-100 text-sage-700 rounded-full pl-2 pr-1 py-0.5">
                        <Paperclip className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-[120px]">{f.name}</span>
                        <button onClick={() => setReplyFiles(fs => fs.filter((_, x) => x !== i))} className="hover:text-red-500 shrink-0"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-sage-100 bg-sage-50">
                  <button
                    onClick={() => replyFileRef.current?.click()}
                    disabled={replyFiles.length >= MAX_ATTACHMENTS}
                    className="w-7 h-7 hover:bg-sage-200 rounded-lg flex items-center justify-center disabled:opacity-40"
                    title="Attach files"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-sage-400" />
                  </button>
                  <input ref={replyFileRef} type="file" multiple className="hidden" onChange={e => pickFiles(e, replyFiles, setReplyFiles)} />
                  <div className="flex items-center gap-2">
                    {replyText && <button onClick={() => { setReplyText(''); setReplyFiles([]) }} className="text-xs text-sage-400 hover:text-sage-700">Discard</button>}
                    <button
                      onClick={sendReply}
                      disabled={!replyText.trim() || sending}
                      className="btn-primary text-xs px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border border-sage-100 shadow-card flex flex-col items-center justify-center gap-3">
            <InboxIcon className="w-12 h-12 text-sage-200" />
            <p className="text-sm font-medium text-sage-400">Select a thread to read</p>
            <p className="text-xs text-sage-300">Choose a message from the list</p>
          </div>
        )}
      </div>

      {/* ── Compose modal ──────────────────────────────────────────────────── */}
      {showCompose && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCompose(false)} />
          <div className="fixed bottom-6 right-6 z-50 w-[520px] bg-white rounded-2xl shadow-2xl border border-sage-100 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3.5 bg-forest shrink-0">
              <span className="text-sm font-semibold text-white">New message</span>
              <button onClick={() => { setShowCompose(false); setComposeFiles([]) }} className="w-6 h-6 rounded-lg hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="divide-y divide-sage-100 shrink-0">
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xs text-sage-400 w-14 shrink-0">To</span>
                <input value={compose.to} onChange={e => setCompose(p => ({ ...p, to: e.target.value }))}
                  placeholder="recipient@example.com"
                  className="flex-1 text-sm text-sage-800 placeholder:text-sage-300 focus:outline-none" />
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xs text-sage-400 w-14 shrink-0">From</span>
                <select
                  value={compose.fromAccountId}
                  onChange={e => setCompose(p => ({ ...p, fromAccountId: parseInt(e.target.value) }))}
                  className="flex-1 text-sm text-sage-800 focus:outline-none appearance-none bg-transparent"
                >
                  {accounts.length === 0
                    ? <option value={0}>No accounts configured</option>
                    : accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)
                  }
                </select>
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xs text-sage-400 w-14 shrink-0">Subject</span>
                <input value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Email subject…"
                  className="flex-1 text-sm text-sage-800 placeholder:text-sage-300 focus:outline-none" />
              </div>
            </div>

            <textarea
              value={compose.body}
              onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
              placeholder="Write your message…"
              className="flex-1 px-5 py-4 text-sm text-sage-800 placeholder:text-sage-300 resize-none focus:outline-none min-h-[200px]"
            />

            {composeFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-5 pb-2">
                {composeFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-sage-100 text-sage-700 rounded-full pl-2 pr-1 py-0.5">
                    <Paperclip className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate max-w-[120px]">{f.name}</span>
                    <button onClick={() => setComposeFiles(fs => fs.filter((_, x) => x !== i))} className="hover:text-red-500 shrink-0"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}

            {sendError && (
              <div className="flex items-start gap-2 bg-red-50 border-t border-red-200 px-5 py-2.5 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{sendError}
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3 border-t border-sage-100 bg-sage-50 shrink-0">
              <button
                onClick={() => composeFileRef.current?.click()}
                disabled={composeFiles.length >= MAX_ATTACHMENTS}
                className="w-7 h-7 hover:bg-sage-200 rounded-lg flex items-center justify-center disabled:opacity-40"
                title="Attach files"
              >
                <Paperclip className="w-3.5 h-3.5 text-sage-400" />
              </button>
              <input ref={composeFileRef} type="file" multiple className="hidden" onChange={e => pickFiles(e, composeFiles, setComposeFiles)} />
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowCompose(false); setComposeFiles([]) }} className="text-xs text-sage-400 hover:text-sage-700 px-3 py-2">Discard</button>
                <button
                  onClick={sendCompose}
                  disabled={!compose.to || !compose.subject || !compose.body || sending}
                  className="btn-primary text-xs px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
