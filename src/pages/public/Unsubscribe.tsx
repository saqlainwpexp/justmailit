import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Mail, CheckCircle, AlertCircle } from 'lucide-react'

interface UnsubInfo { email: string; alreadyUnsubscribed: boolean }

// Rendered at /unsubscribe/:token — a standalone, publicly hosted page (not
// wrapped in ProtectedRoute, no sidebar/nav). The actual unsubscribe only
// happens on the button click (POST), not on page load (GET) — email
// scanners and Outlook Safe Links prefetch every link in an inbound message,
// so a GET-triggered unsubscribe would silently opt people out who never
// clicked anything.
export default function Unsubscribe() {
  const { token } = useParams()
  const [info, setInfo] = useState<UnsubInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/unsubscribe/${token}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setInfo)
      .catch(() => setNotFound(true))
  }, [token])

  async function confirmUnsubscribe() {
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`/api/public/unsubscribe/${token}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Something went wrong.')
      setDone(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-800">Link not found</h1>
          <p className="text-sm text-gray-500 mt-1">This unsubscribe link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-[#2d5a3d] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 rounded-lg bg-[#2d5a3d] flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
        {done || info.alreadyUnsubscribed ? (
          <>
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900">You're unsubscribed</h1>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-medium">{info.email}</span> will no longer receive marketing emails from us.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Unsubscribe from emails?</h1>
            <p className="text-sm text-gray-500 mt-2 mb-6">
              <span className="font-medium">{info.email}</span> will stop receiving marketing emails from us. You can always resubscribe later by signing up again.
            </p>
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-left">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
            <button
              onClick={confirmUnsubscribe}
              disabled={submitting}
              className="w-full bg-[#2d5a3d] hover:bg-[#234a31] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Unsubscribing…' : 'Confirm unsubscribe'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
