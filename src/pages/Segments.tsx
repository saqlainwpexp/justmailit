import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Loader2, X, AlertCircle, Check, Filter, Users } from 'lucide-react'
import { useData, apiFetch } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SegmentCondition { field: string; value?: string | number }
interface Segment {
  id: number
  name: string
  description: string
  matchType: 'all' | 'any'
  conditions: SegmentCondition[]
  count: number
  createdAt: string
}

type FieldKind = 'text' | 'number' | 'select' | 'none'
const FIELD_CONFIG: Record<string, { label: string; kind: FieldKind; placeholder?: string; options?: string[] }> = {
  tag:                  { label: 'Has tag',                                 kind: 'text',   placeholder: 'vip' },
  tag_not:              { label: 'Does NOT have tag',                      kind: 'text',   placeholder: 'vip' },
  list:                 { label: 'In list',                                 kind: 'text',   placeholder: 'newsletter' },
  list_not:             { label: 'NOT in list',                            kind: 'text',   placeholder: 'newsletter' },
  status:               { label: 'Status is',                              kind: 'select', options: ['subscribed', 'unsubscribed'] },
  email_domain:         { label: 'Email domain is',                        kind: 'text',   placeholder: 'gmail.com' },
  company_contains:     { label: 'Company contains',                       kind: 'text',   placeholder: 'Acme' },
  added_within_days:    { label: 'Added in the last __ days',              kind: 'number', placeholder: '30' },
  added_before_days:    { label: 'Added more than __ days ago',            kind: 'number', placeholder: '30' },
  opened_within_days:   { label: 'Opened a campaign in the last __ days',  kind: 'number', placeholder: '30' },
  clicked_within_days:  { label: 'Clicked a campaign in the last __ days', kind: 'number', placeholder: '30' },
  never_opened:         { label: 'Has never opened any campaign',          kind: 'none' },
  never_clicked:        { label: 'Has never clicked any campaign',         kind: 'none' },
}
const FIELD_KEYS = Object.keys(FIELD_CONFIG)

// ─── Condition row ────────────────────────────────────────────────────────────

function ConditionRow({ cond, onChange, onRemove }: { cond: SegmentCondition; onChange: (c: SegmentCondition) => void; onRemove: () => void }) {
  const cfg = FIELD_CONFIG[cond.field] || FIELD_CONFIG.tag
  return (
    <div className="flex items-center gap-2">
      <select
        className="input flex-1"
        value={cond.field}
        onChange={e => {
          const nextCfg = FIELD_CONFIG[e.target.value]
          onChange({ field: e.target.value, value: nextCfg.kind === 'none' ? undefined : nextCfg.kind === 'select' ? nextCfg.options![0] : '' })
        }}
      >
        {FIELD_KEYS.map(k => <option key={k} value={k}>{FIELD_CONFIG[k].label}</option>)}
      </select>
      {cfg.kind === 'text' && (
        <input className="input flex-1" value={(cond.value as string) || ''} placeholder={cfg.placeholder}
          onChange={e => onChange({ ...cond, value: e.target.value })} />
      )}
      {cfg.kind === 'number' && (
        <input className="input w-24" type="number" min={1} value={(cond.value as number) || ''} placeholder={cfg.placeholder}
          onChange={e => onChange({ ...cond, value: e.target.value ? parseInt(e.target.value) : '' })} />
      )}
      {cfg.kind === 'select' && (
        <select className="input flex-1" value={cond.value as string} onChange={e => onChange({ ...cond, value: e.target.value })}>
          {cfg.options!.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      <button type="button" onClick={onRemove} className="p-2 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Segment modal ────────────────────────────────────────────────────────────

function SegmentModal({ segment, onClose, onSaved }: { segment?: Segment; onClose: () => void; onSaved: () => void }) {
  const editing = !!segment
  const [name, setName] = useState(segment?.name || '')
  const [description, setDescription] = useState(segment?.description || '')
  const [matchType, setMatchType] = useState<'all' | 'any'>(segment?.matchType || 'all')
  const [conditions, setConditions] = useState<SegmentCondition[]>(segment?.conditions?.length ? segment.conditions : [{ field: 'tag', value: '' }])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await apiFetch<{ count: number }>('/api/segments/preview', { json: { conditions, matchType } })
        setPreviewCount(res.count)
      } catch {
        setPreviewCount(null)
      } finally {
        setPreviewLoading(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [conditions, matchType])

  function updateCondition(i: number, c: SegmentCondition) {
    setConditions(prev => prev.map((x, idx) => (idx === i ? c : x)))
  }
  function addCondition() {
    setConditions(prev => [...prev, { field: 'tag', value: '' }])
  }
  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !conditions.length) return
    setLoading(true); setError('')
    const body = { name: name.trim(), description: description.trim(), matchType, conditions }
    try {
      if (editing) await apiFetch(`/api/segments/${segment!.id}`, { method: 'PUT', json: body })
      else await apiFetch('/api/segments', { json: body })
      onSaved(); onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-sage-900">{editing ? 'Edit segment' : 'New segment'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-100 flex items-center justify-center"><X className="w-4 h-4 text-sage-400" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
          <div>
            <label className="label">Segment name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Engaged VIPs" />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Opened recently and tagged VIP" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label !mb-0">Conditions</label>
              <div className="flex items-center gap-1 bg-sage-100 rounded-lg p-0.5">
                {(['all', 'any'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMatchType(m)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${matchType === m ? 'bg-white text-forest shadow-sm' : 'text-sage-500'}`}>
                    Match {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <ConditionRow key={i} cond={c} onChange={v => updateCondition(i, v)} onRemove={() => removeCondition(i)} />
              ))}
            </div>
            <button type="button" onClick={addCondition} className="btn-ghost text-xs mt-2 px-2 py-1"><Plus className="w-3 h-3" />Add condition</button>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-forest/5 text-forest">
            <Users className="w-4 h-4 shrink-0" />
            {previewLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <span><span className="font-bold">{previewCount ?? '—'}</span> contact{previewCount === 1 ? '' : 's'} currently match{previewCount === 1 ? 'es' : ''}</span>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? 'Save changes' : 'Create segment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Segments() {
  const { data, loading, reload } = useData<Segment[]>('/api/segments')
  const [modal, setModal] = useState<'new' | Segment | null>(null)
  const [deleting, setDeleting] = useState<Segment | null>(null)

  async function confirmDelete() {
    if (!deleting) return
    await apiFetch(`/api/segments/${deleting.id}`, { method: 'DELETE' })
    setDeleting(null); reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Segments</h1>
          <p className="page-subtitle">Live-filtered contact groups you can target directly from a campaign</p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary shrink-0"><Plus className="w-4 h-4" />New segment</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-forest animate-spin" /></div>
      ) : !data?.length ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Filter className="w-9 h-9 text-sage-300 mb-3" />
          <p className="text-sm font-medium text-sage-600 mb-1">No segments yet</p>
          <p className="text-xs text-sage-400 mb-5 max-w-sm">
            Build a saved filter — like "opened a campaign in the last 30 days AND tagged VIP" — to target campaigns precisely without static lists.
          </p>
          <button onClick={() => setModal('new')} className="btn-primary"><Plus className="w-4 h-4" />Create your first segment</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map(s => (
            <div key={s.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-forest truncate">{s.name}</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sage-100 text-sage-500 shrink-0">
                    Match {s.matchType.toUpperCase()} · {s.conditions.length} condition{s.conditions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {s.description && <p className="text-xs text-sage-400 mt-0.5 truncate">{s.description}</p>}
                <p className="text-xs text-sage-500 mt-1 font-medium">{s.count} contact{s.count !== 1 ? 's' : ''} match right now</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setModal(s)} className="btn-ghost text-sm px-3 py-1.5">Edit</button>
                <button onClick={() => setDeleting(s)} className="p-2 rounded-lg hover:bg-red-50 text-sage-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SegmentModal segment={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} onSaved={reload} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-500" /></div>
            <h2 className="text-base font-semibold text-gray-900 text-center mb-1">Delete segment?</h2>
            <p className="text-sm text-gray-500 text-center mb-6">"{deleting.name}" will no longer be usable when picking campaign recipients. This cannot be undone.</p>
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
