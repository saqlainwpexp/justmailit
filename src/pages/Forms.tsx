import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Copy, Check, Loader2, X, ExternalLink,
  FileText, Layout, Globe, CheckCheck, AlertCircle,
} from 'lucide-react'
import { useData, apiFetch } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormFields { email: boolean; firstName: boolean; lastName: boolean; company: boolean; phone: boolean }
interface FormDef {
  id: number
  name: string
  fields: FormFields
  tagsToApply: string[]
  listsToApply: string[]
  successMessage: string
  redirectUrl: string | null
  submissionCount: number
  createdAt: string
}
interface LandingPage {
  id: number
  name: string
  slug: string
  headline: string
  subheadline: string
  body: string
  formId: number | null
  status: 'draft' | 'published'
  viewCount: number
  createdAt: string
}

const FIELD_LABELS: Record<keyof Omit<FormFields, 'email'>, string> = {
  firstName: 'First name', lastName: 'Last name', company: 'Company', phone: 'Phone',
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="shrink-0 p-1.5 rounded-lg hover:bg-sage-100 text-sage-400 hover:text-forest transition-colors"
      title="Copy"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Form modal ───────────────────────────────────────────────────────────────

function FormModal({ form, onClose, onSaved }: { form?: FormDef; onClose: () => void; onSaved: () => void }) {
  const editing = !!form
  const [name, setName] = useState(form?.name || '')
  const [fields, setFields] = useState<FormFields>(form?.fields || { email: true, firstName: true, lastName: false, company: false, phone: false })
  const [tags, setTags] = useState((form?.tagsToApply || []).join(', '))
  const [successMessage, setSuccessMessage] = useState(form?.successMessage || 'Thanks for signing up!')
  const [redirectUrl, setRedirectUrl] = useState(form?.redirectUrl || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<FormDef | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError('')
    const body = {
      name: name.trim(), fields,
      tagsToApply: tags.split(',').map(t => t.trim()).filter(Boolean),
      successMessage: successMessage.trim() || 'Thanks for signing up!',
      redirectUrl: redirectUrl.trim() || null,
    }
    try {
      const result = editing
        ? await apiFetch<FormDef>(`/api/forms/${form!.id}`, { method: 'PUT', json: body })
        : await apiFetch<FormDef>('/api/forms', { json: body })
      if (editing) { onSaved(); onClose() } else { setSaved(result) }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const embedCode = saved ? `<iframe src="${window.location.origin}/embed/form/${saved.id}" width="100%" height="420" frameborder="0" style="border:none;max-width:480px"></iframe>` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{saved ? 'Form created' : editing ? 'Edit form' : 'New signup form'}</h3>
          <button onClick={() => { if (saved) onSaved(); onClose() }} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400" /></button>
        </div>

        {saved ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <Check className="w-4 h-4 shrink-0" /> "{saved.name}" is ready to embed.
            </div>
            <div>
              <label className="label">Embed code (paste into your website)</label>
              <div className="flex items-start gap-2 bg-sage-50 rounded-lg px-3 py-2.5 mt-1.5">
                <code className="text-[11px] text-forest break-all flex-1 leading-relaxed">{embedCode}</code>
                <CopyButton value={embedCode} />
              </div>
            </div>
            <button onClick={() => { onSaved(); onClose() }} className="btn-primary w-full justify-center">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
            <div>
              <label className="label">Form name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Newsletter signup" />
            </div>
            <div>
              <label className="label">Fields to collect</label>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-forest/10 text-forest">Email (always required)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map(k => (
                  <label key={k} className="flex items-center gap-2 text-xs text-sage-700 cursor-pointer">
                    <input type="checkbox" checked={fields[k]} onChange={e => setFields(f => ({ ...f, [k]: e.target.checked }))}
                      className="rounded border-sage-300 text-forest focus:ring-forest/20 w-3.5 h-3.5" />
                    {FIELD_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Tags to apply on submit (comma-separated)</label>
              <input className="input" value={tags} onChange={e => setTags(e.target.value)} placeholder="newsletter, website-signup" />
            </div>
            <div>
              <label className="label">Success message</label>
              <input className="input" value={successMessage} onChange={e => setSuccessMessage(e.target.value)} />
            </div>
            <div>
              <label className="label">Redirect URL (optional — overrides success message)</label>
              <input className="input" type="url" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)} placeholder="https://yoursite.com/thank-you" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
              <button type="submit" disabled={loading || !name.trim()} className="btn-primary flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? 'Save changes' : 'Create form'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Forms tab ────────────────────────────────────────────────────────────────

function FormsTab() {
  const { data, loading, reload } = useData<FormDef[]>('/api/forms')
  const [modal, setModal] = useState<'new' | FormDef | null>(null)
  const [deleting, setDeleting] = useState<FormDef | null>(null)

  async function confirmDelete() {
    if (!deleting) return
    await apiFetch(`/api/forms/${deleting.id}`, { method: 'DELETE' })
    setDeleting(null); reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-sage-500">Embeddable signup forms for your own website — collect leads directly into your contacts.</p>
        <button onClick={() => setModal('new')} className="btn-primary shrink-0"><Plus className="w-4 h-4" />New form</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-forest animate-spin" /></div>
      ) : !data?.length ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <FileText className="w-9 h-9 text-sage-300 mb-3" />
          <p className="text-sm font-medium text-sage-600 mb-1">No forms yet</p>
          <p className="text-xs text-sage-400 mb-5 max-w-sm">Create an embeddable form to start capturing signups from your own website.</p>
          <button onClick={() => setModal('new')} className="btn-primary"><Plus className="w-4 h-4" />Create your first form</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map(f => (
            <div key={f.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-forest truncate">{f.name}</p>
                <p className="text-xs text-sage-400 mt-0.5">{f.submissionCount} submission{f.submissionCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setModal(f)} className="btn-ghost text-sm px-3 py-1.5">Edit</button>
                <button onClick={() => setDeleting(f)} className="p-2 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FormModal form={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} onSaved={reload} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-500" /></div>
            <h2 className="text-base font-semibold text-gray-900 text-center mb-1">Delete form?</h2>
            <p className="text-sm text-gray-500 text-center mb-6">"{deleting.name}" will stop accepting submissions immediately. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Landing page modal ───────────────────────────────────────────────────────

function LandingPageModal({ page, forms, onClose, onSaved }: { page?: LandingPage; forms: FormDef[]; onClose: () => void; onSaved: () => void }) {
  const editing = !!page
  const [name, setName] = useState(page?.name || '')
  const [slug, setSlug] = useState(page?.slug || '')
  const [headline, setHeadline] = useState(page?.headline || '')
  const [subheadline, setSubheadline] = useState(page?.subheadline || '')
  const [body, setBody] = useState(page?.body || '')
  const [formId, setFormId] = useState<string>(page?.formId ? String(page.formId) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError('')
    const payload: Record<string, unknown> = {
      name: name.trim(), headline: headline.trim() || name.trim(), subheadline: subheadline.trim(),
      body, formId: formId ? parseInt(formId) : null,
    }
    if (editing) payload.slug = slug.trim()
    try {
      if (editing) await apiFetch(`/api/landing-pages/${page!.id}`, { method: 'PUT', json: payload })
      else await apiFetch('/api/landing-pages', { json: payload })
      onSaved(); onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{editing ? 'Edit landing page' : 'New landing page'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
          <div>
            <label className="label">Page name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Spring Sale Landing Page" />
          </div>
          {editing && (
            <div>
              <label className="label">URL slug</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sage-400 shrink-0">{window.location.origin}/lp/</span>
                <input className="input" value={slug} onChange={e => setSlug(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <label className="label">Headline</label>
            <input className="input" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Get 20% off your first order" />
          </div>
          <div>
            <label className="label">Subheadline</label>
            <input className="input" value={subheadline} onChange={e => setSubheadline(e.target.value)} placeholder="Join our list for exclusive deals" />
          </div>
          <div>
            <label className="label">Body content</label>
            <textarea className="input resize-none" rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Tell visitors why they should sign up..." />
          </div>
          <div>
            <label className="label">Embedded form</label>
            <select className="input" value={formId} onChange={e => setFormId(e.target.value)}>
              <option value="">No form (content only)</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? 'Save changes' : 'Create page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Landing pages tab ────────────────────────────────────────────────────────

function LandingPagesTab() {
  const { data, loading, reload } = useData<LandingPage[]>('/api/landing-pages')
  const { data: forms } = useData<FormDef[]>('/api/forms')
  const [modal, setModal] = useState<'new' | LandingPage | null>(null)
  const [deleting, setDeleting] = useState<LandingPage | null>(null)

  async function togglePublish(p: LandingPage) {
    await apiFetch(`/api/landing-pages/${p.id}/publish`, { method: 'POST' })
    reload()
  }

  async function confirmDelete() {
    if (!deleting) return
    await apiFetch(`/api/landing-pages/${deleting.id}`, { method: 'DELETE' })
    setDeleting(null); reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-sage-500">Standalone hosted pages — no developer needed. Share the link anywhere.</p>
        <button onClick={() => setModal('new')} className="btn-primary shrink-0"><Plus className="w-4 h-4" />New page</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-forest animate-spin" /></div>
      ) : !data?.length ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Layout className="w-9 h-9 text-sage-300 mb-3" />
          <p className="text-sm font-medium text-sage-600 mb-1">No landing pages yet</p>
          <p className="text-xs text-sage-400 mb-5 max-w-sm">Build a standalone page to drive signups from ads, social, or anywhere else.</p>
          <button onClick={() => setModal('new')} className="btn-primary"><Plus className="w-4 h-4" />Create your first page</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map(p => {
            const url = `${window.location.origin}/lp/${p.slug}`
            return (
              <div key={p.id} className="card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-forest truncate">{p.name}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-sage-100 text-sage-500'}`}>
                        {p.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <code className="text-[11px] text-sage-400 truncate">{url}</code>
                      <CopyButton value={url} />
                      {p.status === 'published' && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sage-400 hover:text-forest transition-colors"><ExternalLink className="w-3 h-3" /></a>
                      )}
                    </div>
                    <p className="text-[11px] text-sage-400 mt-1">{p.viewCount} view{p.viewCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => togglePublish(p)} className="btn-ghost text-sm px-3 py-1.5">
                      {p.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button onClick={() => setModal(p)} className="btn-ghost text-sm px-3 py-1.5">Edit</button>
                    <button onClick={() => setDeleting(p)} className="p-2 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <LandingPageModal page={modal === 'new' ? undefined : modal} forms={forms || []} onClose={() => setModal(null)} onSaved={reload} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-500" /></div>
            <h2 className="text-base font-semibold text-gray-900 text-center mb-1">Delete this page?</h2>
            <p className="text-sm text-gray-500 text-center mb-6">"{deleting.name}" will go offline immediately. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Forms() {
  const [tab, setTab] = useState<'forms' | 'pages'>('forms')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Forms &amp; Landing Pages</h1>
        <p className="page-subtitle">Capture leads with embeddable forms and standalone pages</p>
      </div>

      <div className="flex items-center gap-1 border-b border-sage-100">
        {[{ id: 'forms', label: 'Signup Forms', icon: FileText }, { id: 'pages', label: 'Landing Pages', icon: Globe }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'forms' | 'pages')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t.id ? 'border-forest text-forest' : 'border-transparent text-sage-500 hover:text-sage-700'}`}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'forms' ? <FormsTab /> : <LandingPagesTab />}
    </div>
  )
}
