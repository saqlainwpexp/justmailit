import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader2, Users } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const PENDING_TOKEN_KEY = 'jm_pending_invite_token'

interface PendingInvite { token: string; workspaceName: string; invitedAt: string }

export default function Invites() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const urlToken  = params.get('token')

  const [invites, setInvites] = useState<PendingInvite[] | null>(null)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Stash the token from the link so it survives a signup/verify-email detour.
  useEffect(() => {
    if (urlToken) sessionStorage.setItem(PENDING_TOKEN_KEY, urlToken)
  }, [urlToken])

  function load() {
    apiFetch<PendingInvite[]>('/api/workspaces/invites/pending')
      .then(setInvites)
      .catch(() => setInvites([]))
  }

  useEffect(() => { if (user) load() }, [user])

  // Auto-accept the token that brought the user here, once they're authenticated.
  useEffect(() => {
    const stashed = sessionStorage.getItem(PENDING_TOKEN_KEY)
    if (user && stashed) accept(stashed, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function accept(token: string, silent = false) {
    setBusyToken(token)
    try {
      const r = await apiFetch<{ workspaceName: string }>(`/api/workspaces/invites/${token}/accept`, { method: 'POST' })
      sessionStorage.removeItem(PENDING_TOKEN_KEY)
      setMessage({ ok: true, text: `You've joined "${r.workspaceName}"!` })
      load()
      if (!silent) setTimeout(() => navigate('/'), 1200)
    } catch (e: any) {
      if (!silent) setMessage({ ok: false, text: e.message })
      sessionStorage.removeItem(PENDING_TOKEN_KEY)
    } finally {
      setBusyToken(null)
    }
  }

  async function decline(token: string) {
    setBusyToken(token)
    try {
      await apiFetch(`/api/workspaces/invites/${token}/decline`, { method: 'POST' })
      load()
    } finally {
      setBusyToken(null)
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-forest/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-forest" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-forest">Workspace invites</h1>
          <p className="text-xs text-sage-500">Accept an invite to start collaborating</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4
          ${message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {invites === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-forest animate-spin" /></div>
      ) : invites.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <Mail className="w-8 h-8 text-sage-300 mb-3" />
          <p className="text-sm font-medium text-sage-600">No pending invites</p>
          <p className="text-xs text-sage-400 mt-1">Invites sent to your email will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map(inv => (
            <div key={inv.token} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-forest truncate">{inv.workspaceName}</p>
                <p className="text-xs text-sage-400 mt-0.5">Invited {new Date(inv.invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => decline(inv.token)}
                  disabled={busyToken === inv.token}
                  className="btn-ghost text-sm px-3 py-1.5"
                >
                  Decline
                </button>
                <button
                  onClick={() => accept(inv.token)}
                  disabled={busyToken === inv.token}
                  className="btn-primary text-sm px-3 py-1.5"
                >
                  {busyToken === inv.token ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
