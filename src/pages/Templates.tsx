import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Plus, Search, Copy, Trash2, Edit, MoreHorizontal,
  Eye, X, Tag, ChevronDown, FileText, Check, Loader2,
} from 'lucide-react'
import EmailEditor from './campaigns/components/EmailEditor'
import { useData, apiFetch } from '../lib/api'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Category = 'Cold Outreach' | 'Onboarding' | 'Re-engagement' | 'Nurture' | 'Transactional'

interface Template {
  id: number
  name: string
  subject: string
  category: Category
  body: string
  used: number
  updated: string
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CATEGORIES: Category[] = ['Cold Outreach', 'Onboarding', 'Re-engagement', 'Nurture', 'Transactional']

const CATEGORY_COLORS: Record<Category, string> = {
  'Cold Outreach':   'bg-blue-50 text-blue-700',
  'Onboarding':      'bg-green-50 text-green-700',
  'Re-engagement':   'bg-coral/10 text-coral',
  'Nurture':         'bg-purple-50 text-purple-700',
  'Transactional':   'bg-amber-50 text-amber-700',
}

const MERGE_TAG_EXAMPLES: Record<string, string> = {
  '{{first_name}}':      'Alex',
  '{{last_name}}':       'Johnson',
  '{{email}}':           'alex@example.com',
  '{{company}}':         'Acme Corp',
  '{{sender_name}}':     'Saqlain',
  '{{sender_email}}':    'sales@justmailit.com',
  '{{unsubscribe_link}}':'https://justmailit.com/unsub/demo',
  '{{date}}':            new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  '{{topic}}':           'Email Marketing Tips',
}

function fillMergeTags(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match) => MERGE_TAG_EXAMPLES[match] ?? match)
}

const SEED_TEMPLATES: Template[] = [
  {
    id: 1,
    name: 'Welcome Email',
    subject: "Welcome to {{company}} â€” let's get started",
    category: 'Onboarding',
    body: '<p>Hi <strong>{{first_name}}</strong>,</p><p>Thank you for joining us! We\'re excited to have you on board.</p><p>Here\'s what you can do next:</p><ul><li>Complete your profile</li><li>Explore our features</li><li>Reach out if you need help</li></ul><p>Best,<br>{{sender_name}}</p>',
    used: 12,
    updated: 'Jun 20, 2025',
  },
  {
    id: 2,
    name: 'Follow-up #1',
    subject: 'Quick follow-up from {{sender_name}}',
    category: 'Cold Outreach',
    body: '<p>Hi <strong>{{first_name}}</strong>,</p><p>I wanted to follow up on my previous email. Did you get a chance to review what I sent?</p><p>I\'d love to show you how we can help <strong>{{company}}</strong> achieve better results.</p><p>Would you have 15 minutes this week?</p><p>Best,<br>{{sender_name}}</p>',
    used: 88,
    updated: 'Jun 18, 2025',
  },
  {
    id: 3,
    name: 'Follow-up #2 (No reply)',
    subject: 'Still interested, {{first_name}}?',
    category: 'Cold Outreach',
    body: '<p>Hi <strong>{{first_name}}</strong>,</p><p>I know you\'re busy â€” just wanted to check in one more time before I close your file.</p><p>If the timing isn\'t right, no worries at all. I\'ll be here whenever you\'re ready.</p><p>Let me know either way!</p><p>Best,<br>{{sender_name}}</p>',
    used: 54,
    updated: 'Jun 15, 2025',
  },
  {
    id: 4,
    name: 'Re-engagement',
    subject: 'We miss you, {{first_name}}',
    category: 'Re-engagement',
    body: '<p>Hi <strong>{{first_name}}</strong>,</p><p>We noticed it\'s been a while since we\'ve heard from you.</p><p>A lot has changed at {{company}} â€” we\'ve been busy improving things for you.</p><p>Come back and take a look â€” you might be surprised.</p><p>Best,<br>{{sender_name}}</p>',
    used: 23,
    updated: 'Jun 10, 2025',
  },
  {
    id: 5,
    name: 'Value Email',
    subject: '{{topic}} â€” something useful for you',
    category: 'Nurture',
    body: '<p>Hi <strong>{{first_name}}</strong>,</p><p>I wanted to share something that might be helpful for you and your team at <strong>{{company}}</strong>.</p><p>We recently put together a resource on <em>{{topic}}</em> that covers:</p><ul><li>Key insights you need to know</li><li>Actionable steps to get started</li><li>Real examples from similar companies</li></ul><p>Hope you find it useful!</p><p>Best,<br>{{sender_name}}</p>',
    used: 31,
    updated: 'Jun 5, 2025',
  },
]

// â”€â”€â”€ Blank form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BLANK_FORM = { name: '', subject: '', category: 'Cold Outreach' as Category, body: '' }

// â”€â”€â”€ MoreMenu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MoreMenu({
  onEdit,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void
  onPreview: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { icon: Eye,   label: 'Preview',   action: onPreview,   cls: '' },
    { icon: Edit,  label: 'Edit',      action: onEdit,      cls: '' },
    { icon: Copy,  label: 'Duplicate', action: onDuplicate, cls: '' },
    { icon: Trash2,label: 'Delete',    action: onDelete,    cls: 'text-red-500 hover:bg-red-50' },
  ]

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-sage-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-sage-100 rounded-xl shadow-lg z-20 py-1 w-36 overflow-hidden">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-sage-700 hover:bg-sage-50 transition-colors ${item.cls}`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Template card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TemplateCard({
  t,
  onEdit,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  t: Template
  onEdit: () => void
  onPreview: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="card group flex flex-col cursor-pointer hover:shadow-card-hover transition-shadow"
      onClick={onEdit}
    >
      {/* Email preview mockup */}
      <div className="bg-sage-50 rounded-xl p-4 mb-4 border border-sage-100 min-h-[110px] relative overflow-hidden">
        <div className="w-10 h-1.5 bg-sage-300 rounded-full mb-2" />
        <div className="w-16 h-1 bg-sage-200 rounded-full mb-3" />
        <div
          className="text-[9px] text-sage-400 leading-relaxed line-clamp-4 prose-reset"
          dangerouslySetInnerHTML={{ __html: fillMergeTags(t.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) }}
        />
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sage-50 to-transparent" />
      </div>

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-semibold text-forest leading-snug">{t.name}</p>
          <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[t.category]}`}>
            {t.category}
          </span>
        </div>
        <p className="text-xs text-sage-500 line-clamp-1">{t.subject}</p>
      </div>

      <div className="mt-4 pt-3 border-t border-sage-100 flex items-center justify-between">
        <div className="text-[10px] text-sage-400">
          Used <span className="font-semibold text-sage-600">{t.used}x</span> Â· {t.updated}
        </div>
        <MoreMenu
          onEdit={onEdit}
          onPreview={onPreview}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

// â”€â”€â”€ Edit / Create modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TemplateModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Partial<Template>
  onSave: (data: { name: string; subject: string; category: Category; body: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    subject: initial.subject ?? '',
    category: initial.category ?? ('Cold Outreach' as Category),
    body: initial.body ?? '',
  })
  const [catOpen, setCatOpen] = useState(false)
  const catRef = useRef<HTMLDivElement>(null)
  const isEdit = !!initial.id

  useEffect(() => {
    if (!catOpen) return
    function handler(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [catOpen])

  const canSave = form.name.trim() && form.subject.trim()

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-sage-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-forest/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-forest" />
            </div>
            <h2 className="text-base font-semibold text-forest">
              {isEdit ? 'Edit template' : 'New template'}
            </h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
            <X className="w-4 h-4 text-sage-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
          {/* Name + Category row */}
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <label className="label">Template name <span className="text-coral">*</span></label>
              <input
                className="input"
                placeholder="e.g. Welcome Email"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Category</label>
              <div ref={catRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCatOpen(v => !v)}
                  className="input flex items-center justify-between cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[form.category]}`}>
                      {form.category}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-sage-400" />
                </button>
                {catOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-sage-200 rounded-xl shadow-lg z-30 py-1 overflow-hidden">
                    {CATEGORIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, category: c })); setCatOpen(false) }}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-sage-50 transition-colors"
                      >
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[c]}`}>{c}</span>
                        {form.category === c && <Check className="w-3.5 h-3.5 text-forest" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="label">Subject line <span className="text-coral">*</span></label>
            <input
              className="input"
              placeholder="e.g. Welcome to {{company}} â€” let's get started"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
            <p className="text-[10px] text-sage-400 mt-1">You can use merge tags like <code className="font-mono text-forest">{'{{first_name}}'}</code></p>
          </div>

          {/* Body */}
          <div>
            <label className="label">Email body</label>
            <EmailEditor
              value={form.body}
              onChange={html => setForm(f => ({ ...f, body: html }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sage-100 shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!canSave}
            onClick={() => canSave && onSave(form)}
          >
            {isEdit ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Preview modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PreviewModal({ t, onClose }: { t: Template; onClose: () => void }) {
  const filledSubject = fillMergeTags(t.subject)
  const filledBody = fillMergeTags(t.body)

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sage-100 shrink-0">
          <div className="flex items-center gap-3">
            <Eye className="w-4 h-4 text-forest" />
            <div>
              <p className="text-sm font-semibold text-forest">{t.name}</p>
              <p className="text-xs text-sage-400">Preview with example data</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
            <X className="w-4 h-4 text-sage-400" />
          </button>
        </div>

        {/* Email frame */}
        <div className="flex-1 overflow-y-auto p-6 bg-sage-50">
          <div className="bg-white rounded-xl border border-sage-200 shadow-sm max-w-xl mx-auto">
            {/* Email header */}
            <div className="px-6 py-4 border-b border-sage-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-sage-400 w-10 shrink-0">From</span>
                <span className="text-xs font-medium text-sage-700">Saqlain &lt;sales@justmailit.com&gt;</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-sage-400 w-10 shrink-0">To</span>
                <span className="text-xs text-sage-700">Alex Johnson &lt;alex@example.com&gt;</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-sage-400 w-10 shrink-0 mt-0.5">Subject</span>
                <span className="text-xs font-semibold text-sage-900">{filledSubject}</span>
              </div>
            </div>

            {/* Email body */}
            <div
              className="px-6 py-5 prose prose-sm max-w-none text-sage-800
                [&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1
                [&_strong]:text-sage-900 [&_a]:text-forest [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: filledBody }}
            />

            {/* Unsubscribe footer */}
            <div className="px-6 py-4 border-t border-sage-100 bg-sage-50/50 rounded-b-xl">
              <p className="text-[10px] text-sage-400 text-center">
                You're receiving this because you opted in.{' '}
                <a href="#" className="text-forest underline">Unsubscribe</a>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-sage-100 shrink-0 bg-white">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[t.category]}`}>
            {t.category}
          </span>
          <p className="text-[10px] text-sage-400">Merge tags filled with example data</p>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Delete confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DeleteConfirm({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-sage-900 mb-1">Delete template?</h3>
        <p className="text-sm text-sage-500 mb-5">
          "<span className="font-medium text-sage-700">{name}</span>" will be permanently deleted.
        </p>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Templates() {
  const { data: rawTemplates, loading, reload } = useData<Template[]>('/api/templates')
  const templates = rawTemplates || []
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [editTarget, setEditTarget] = useState<Partial<Template> | null>(null)
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)

  const filtered = useMemo(() => {
    return templates.filter(t =>
      (cat === 'All' || t.category === cat) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
       t.subject.toLowerCase().includes(search.toLowerCase()))
    )
  }, [templates, cat, search])

  async function saveTemplate(data: { name: string; subject: string; category: Category; body: string }) {
    if (editTarget?.id) {
      await apiFetch(`/api/templates/${editTarget.id}`, { method: 'PUT', json: data })
    } else {
      await apiFetch('/api/templates', { json: data })
    }
    setEditTarget(null)
    reload()
  }

  async function duplicate(t: Template) {
    await apiFetch('/api/templates', { json: { name: `${t.name} (copy)`, subject: t.subject, category: t.category, body: t.body } })
    reload()
  }

  async function deleteTemplate(t: Template) {
    await apiFetch(`/api/templates/${t.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    reload()
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 text-forest animate-spin"/></div>

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Reusable email templates with merge tags</p>
        </div>
        <button className="btn-primary" onClick={() => setEditTarget(BLANK_FORM)}>
          <Plus className="w-4 h-4" />
          New template
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total templates', value: templates.length },
          { label: 'Total uses', value: templates.reduce((s, t) => s + t.used, 0).toLocaleString() },
          { label: 'Most used', value: [...templates].sort((a, b) => b.used - a.used)[0]?.name ?? 'â€”' },
          { label: 'Categories', value: CATEGORIES.length },
        ].map(s => (
          <div key={s.label} className="card py-4">
            <p className="text-xs text-sage-500 font-medium">{s.label}</p>
            <p className={`font-bold text-forest mt-1 ${typeof s.value === 'string' && s.value.length > 8 ? 'text-sm' : 'text-2xl'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {(['All', ...CATEGORIES] as string[]).map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                cat === c
                  ? 'bg-forest text-white'
                  : 'bg-white text-sage-600 border border-sage-200 hover:bg-sage-50'
              }`}
            >
              {c}
              {c !== 'All' && (
                <span className={`ml-1.5 text-[9px] px-1 rounded-full ${cat === c ? 'bg-white/20 text-white' : 'bg-sage-100 text-sage-500'}`}>
                  {templates.filter(t => t.category === c).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sage-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="input pl-9 py-2 text-xs"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-sage-400" />
            </button>
          )}
        </div>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(t => (
          <TemplateCard
            key={t.id}
            t={t}
            onEdit={() => setEditTarget(t)}
            onPreview={() => setPreviewTarget(t)}
            onDuplicate={() => duplicate(t)}
            onDelete={() => setDeleteTarget(t)}
          />
        ))}

        {/* Create card */}
        <button
          onClick={() => setEditTarget(BLANK_FORM)}
          className="border-2 border-dashed border-sage-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3
                     hover:border-forest/30 hover:bg-sage-50 transition-all text-center group min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-xl bg-sage-100 group-hover:bg-forest/10 flex items-center justify-center transition-colors">
            <Plus className="w-5 h-5 text-sage-400 group-hover:text-forest transition-colors" />
          </div>
          <div>
            <p className="text-sm font-medium text-sage-600 group-hover:text-forest transition-colors">Create template</p>
            <p className="text-xs text-sage-400 mt-0.5">Write once, reuse everywhere</p>
          </div>
        </button>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-sage-400" />
            </div>
            <p className="text-sm font-medium text-sage-700">No templates found</p>
            <p className="text-xs text-sage-400 mt-1">Try adjusting your search or filter</p>
          </div>
        )}
      </div>

      {/* Merge tags reference */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-4 h-4 text-forest" />
          <h2 className="section-title">Available merge tags</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['{{first_name}}',      "Contact's first name"],
            ['{{last_name}}',       "Contact's last name"],
            ['{{email}}',           "Contact's email"],
            ['{{company}}',         "Contact's company"],
            ['{{sender_name}}',     'Your name'],
            ['{{sender_email}}',    'Your email'],
            ['{{unsubscribe_link}}','Unsubscribe URL'],
            ['{{date}}',            "Today's date"],
          ].map(([tag, desc]) => (
            <div key={tag} className="bg-sage-50 rounded-xl p-3 border border-sage-100">
              <code className="text-xs font-mono font-semibold text-forest">{tag}</code>
              <p className="text-[10px] text-sage-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {editTarget !== null && (
        <TemplateModal
          initial={editTarget}
          onSave={saveTemplate}
          onClose={() => setEditTarget(null)}
        />
      )}
      {previewTarget && (
        <PreviewModal t={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          onConfirm={() => deleteTemplate(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
