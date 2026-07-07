import { useState } from 'react'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface FormFields { email: boolean; firstName: boolean; lastName: boolean; company: boolean; phone: boolean }
export interface PublicFormConfig { id: number; name: string; fields: FormFields }

const FIELD_PLACEHOLDERS: Record<keyof Omit<FormFields, 'email'>, string> = {
  firstName: 'First name', lastName: 'Last name', company: 'Company', phone: 'Phone number',
}

// Shared form UI + submit logic used by both the standalone landing page and
// the iframe-embeddable form — both talk to the same unauthenticated public
// API (no cookies, permissive CORS on the server side).
export default function PublicForm({ config }: { config: PublicFormConfig }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ message: string } | null>(null)

  function set(key: string, v: string) { setValues(prev => ({ ...prev, [key]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.email?.trim()) { setError('Email address is required.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/public/forms/${config.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      if (data.redirectUrl) { window.location.href = data.redirectUrl; return }
      setResult({ message: data.message || 'Thanks for signing up!' })
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-12 h-12 rounded-full bg-[#f0f7f2] flex items-center justify-center mb-3">
          <CheckCircle className="w-6 h-6 text-[#2d5a3d]" />
        </div>
        <p className="text-sm font-medium text-gray-800">{result.message}</p>
      </div>
    )
  }

  const fieldOrder: (keyof Omit<FormFields, 'email'>)[] = ['firstName', 'lastName', 'company', 'phone']

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email" required placeholder="you@example.com" value={values.email || ''}
        onChange={e => set('email', e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]"
      />
      {fieldOrder.filter(k => config.fields[k]).map(k => (
        <input
          key={k} placeholder={FIELD_PLACEHOLDERS[k]} value={values[k] || ''}
          onChange={e => set(k, e.target.value)}
          className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]"
        />
      ))}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}
      <button
        type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d5a3d] hover:bg-[#245030] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit'}
      </button>
    </form>
  )
}
