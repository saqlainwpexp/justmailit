import { useState, useEffect } from 'react'
import { X, Check, ChevronDown } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { cn } from '../../lib/utils'
import { apiFetch } from '../../lib/api'

const TRIGGER_TYPES = [
  { value: 'list_added',       label: 'Contact added to list' },
  { value: 'tag_added',        label: 'Tag added to contact' },
  { value: 'form_submitted',   label: 'Form submitted' },
  { value: 'contact_added',    label: 'New contact created' },
  { value: 'date_based',       label: 'Date / Anniversary' },
]
const CONDITION_TYPES = [
  { value: 'email_opened',  label: 'Email was opened' },
  { value: 'link_clicked',  label: 'Link was clicked' },
  { value: 'has_tag',       label: 'Contact has tag' },
  { value: 'field_equals',  label: 'Field equals value' },
  { value: 'replied',       label: 'Replied to email' },
]
const ACTION_TYPES = [
  { value: 'add_tag',      label: 'Add tag' },
  { value: 'remove_tag',   label: 'Remove tag' },
  { value: 'update_field', label: 'Update contact field' },
  { value: 'webhook',      label: 'Send webhook' },
  { value: 'notify',       label: 'Internal notification' },
]
const DELAY_UNITS   = ['minutes','hours','days','weeks']

// Trigger types with no backend implementation yet — surfaced so users don't
// configure an automation that can never actually fire (see 'list_added' and
// 'tag_added', which ARE wired up, for contrast).
const UNSUPPORTED_TRIGGERS = new Set(['form_submitted', 'date_based'])

const PANEL_COLOR: Record<string, string> = {
  trigger:   'text-forest',
  email:     'text-coral',
  delay:     'text-amber-600',
  condition: 'text-purple-600',
  action:    'text-blue-600',
}
const PANEL_TITLE: Record<string, string> = {
  trigger:   'Trigger',
  email:     'Send Email',
  delay:     'Wait / Delay',
  condition: 'Condition',
  action:    'Action',
}

interface Props {
  node: Node
  onChange: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function Sel({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className="input appearance-none pr-8">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
    </div>
  )
}

function InfoBox({ children, color = 'amber' }: { children: React.ReactNode; color?: 'amber' | 'purple' | 'blue' }) {
  const cls = {
    amber:  'bg-amber-50 border-amber-200 text-amber-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
  }[color]
  return (
    <div className={cn('border rounded-xl px-3.5 py-3 text-xs leading-relaxed', cls)}>
      {children}
    </div>
  )
}

export default function NodePanel({ node, onChange, onClose }: Props) {
  const type = node.type as string
  const d = node.data as Record<string, any>

  const set  = (key: string, val: unknown) => onChange(node.id, { ...d, [key]: val })
  const setM = (patch: Record<string, unknown>) => onChange(node.id, { ...d, ...patch })

  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])
  useEffect(() => {
    apiFetch<{ email: string; name: string }[]>('/api/accounts').then(setAccounts).catch(() => {})
  }, [])

  return (
    <div className="w-[288px] flex-shrink-0 flex flex-col bg-white border-l border-sage-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-sage-100 shrink-0">
        <div>
          <p className={cn('text-[9px] font-bold uppercase tracking-widest', PANEL_COLOR[type] || 'text-forest')}>
            {PANEL_TITLE[type] || 'Configure'}
          </p>
          <h3 className="text-sm font-semibold text-forest mt-0.5">Configure step</h3>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-sage-500" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Step name">
          <input className="input" value={String(d.label || '')} onChange={e => set('label', e.target.value)} placeholder="Step name" />
        </Field>
        <div className="h-px bg-sage-100" />

        {/* â”€â”€ TRIGGER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {type === 'trigger' && <>
          <Field label="Trigger type">
            <Sel
              value={String(d.triggerType || 'list_added')}
              onChange={v => setM({ triggerType: v, label: TRIGGER_TYPES.find(t => t.value === v)?.label ?? d.label })}
              options={TRIGGER_TYPES}
            />
          </Field>
          {(!d.triggerType || d.triggerType === 'list_added') &&
            <Field label="List name"><input className="input" placeholder="e.g. Warm Leads" value={String(d.triggerValue || '')} onChange={e => set('triggerValue', e.target.value)} /></Field>}
          {d.triggerType === 'tag_added' &&
            <Field label="Tag"><input className="input" placeholder="e.g. interested" value={String(d.triggerValue || '')} onChange={e => set('triggerValue', e.target.value)} /></Field>}
          {d.triggerType === 'form_submitted' &&
            <Field label="Form name"><input className="input" placeholder="e.g. Contact Form" value={String(d.triggerValue || '')} onChange={e => set('triggerValue', e.target.value)} /></Field>}
          {d.triggerType === 'date_based' && <>
            <Field label="Date field"><input className="input" placeholder="e.g. birthday" value={String(d.triggerValue || '')} onChange={e => set('triggerValue', e.target.value)} /></Field>
            <Field label="Days offset (+ after / âˆ’ before)">
              <input className="input" type="number" placeholder="0" value={String(d.triggerDays ?? 0)} onChange={e => set('triggerDays', parseInt(e.target.value) || 0)} />
            </Field>
          </>}
          {UNSUPPORTED_TRIGGERS.has(d.triggerType) && (
            <InfoBox color="amber">
              This trigger isn't wired up on the backend yet — automations using it won't enroll any contacts. Use "Contact added to list" or "Tag added to contact" instead.
            </InfoBox>
          )}
        </>}

        {/* â”€â”€ EMAIL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {type === 'email' && <>
          <Field label="From account">
            {accounts.length ? (
              <Sel
                value={String(d.fromAccount || accounts[0].email)}
                onChange={v => set('fromAccount', v)}
                options={accounts.map(a => ({ value: a.email, label: `${a.name} <${a.email}>` }))}
              />
            ) : (
              <p className="text-xs text-sage-400">No email accounts configured yet — add one under Email Accounts first.</p>
            )}
          </Field>
          <Field label="Subject line">
            <input className="input" placeholder="Subject â€” use {{first_name}} to personalise" value={String(d.subject || '')} onChange={e => set('subject', e.target.value)} />
          </Field>
          <Field label="Email body">
            <textarea
              className="input resize-none text-xs leading-relaxed"
              rows={8}
              placeholder={"Write your email here...\n\nUse {{first_name}}, {{last_name}}, {{company}}, {{email}} for personalisation."}
              value={String(d.body || '')}
              onChange={e => set('body', e.target.value)}
            />
          </Field>
          <div className="flex gap-4">
            {[['trackOpens','Track opens'],['trackClicks','Track clicks']].map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2 text-xs text-sage-700 cursor-pointer">
                <input type="checkbox" checked={!!d[k]} onChange={e => set(k, e.target.checked)}
                  className="rounded border-sage-300 text-forest focus:ring-forest/20 w-3.5 h-3.5" />
                {lbl}
              </label>
            ))}
          </div>
        </>}

        {/* â”€â”€ DELAY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {type === 'delay' && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input className="input" type="number" min={1}
                value={Number(d.delayAmount ?? 1)}
                onChange={e => {
                  const n = Math.max(1, parseInt(e.target.value) || 1)
                  setM({ delayAmount: n, label: `Wait ${n} ${d.delayUnit || 'hours'}`, subtitle: 'Then continue to next step' })
                }}
              />
            </Field>
            <Field label="Unit">
              <Sel
                value={String(d.delayUnit || 'hours')}
                onChange={v => setM({ delayUnit: v, label: `Wait ${d.delayAmount ?? 1} ${v}`, subtitle: 'Then continue to next step' })}
                options={DELAY_UNITS.map(u => ({ value: u, label: u.charAt(0).toUpperCase() + u.slice(1) }))}
              />
            </Field>
          </div>
          <InfoBox color="amber">
            The workflow pauses here, then continues automatically to the next step after the set time.
          </InfoBox>
        </>}

        {/* â”€â”€ CONDITION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {type === 'condition' && <>
          <Field label="Check if contactâ€¦">
            <Sel
              value={String(d.conditionType || 'email_opened')}
              onChange={v => setM({ conditionType: v, label: CONDITION_TYPES.find(t => t.value === v)?.label ?? d.label })}
              options={CONDITION_TYPES}
            />
          </Field>
          {d.conditionType === 'has_tag' &&
            <Field label="Tag"><input className="input" placeholder="e.g. interested" value={String(d.conditionValue || '')} onChange={e => set('conditionValue', e.target.value)} /></Field>}
          {d.conditionType === 'field_equals' && <>
            <Field label="Field name"><input className="input" placeholder="e.g. status" value={String(d.conditionField || '')} onChange={e => set('conditionField', e.target.value)} /></Field>
            <Field label="Value"><input className="input" placeholder="e.g. customer" value={String(d.conditionValue || '')} onChange={e => set('conditionValue', e.target.value)} /></Field>
          </>}
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-3 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-green-700">Yes â€” left handle</p>
                <p className="text-[10px] text-green-600 mt-0.5">Condition met â†’ continue flow</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-600">No â€” right handle</p>
                <p className="text-[10px] text-red-500 mt-0.5">Condition not met â†’ alternate path</p>
              </div>
            </div>
          </div>
        </>}

        {/* â”€â”€ ACTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {type === 'action' && <>
          <Field label="Action">
            <Sel
              value={String(d.actionType || 'add_tag')}
              onChange={v => setM({ actionType: v, label: ACTION_TYPES.find(t => t.value === v)?.label ?? d.label })}
              options={ACTION_TYPES}
            />
          </Field>
          {(!d.actionType || d.actionType === 'add_tag' || d.actionType === 'remove_tag') &&
            <Field label="Tag name"><input className="input" placeholder="e.g. hot-lead" value={String(d.actionValue || '')} onChange={e => set('actionValue', e.target.value)} /></Field>}
          {d.actionType === 'update_field' && <>
            <Field label="Field"><input className="input" placeholder="e.g. status" value={String(d.actionField || '')} onChange={e => set('actionField', e.target.value)} /></Field>
            <Field label="New value"><input className="input" placeholder="e.g. customer" value={String(d.actionValue || '')} onChange={e => set('actionValue', e.target.value)} /></Field>
          </>}
          {d.actionType === 'webhook' &&
            <Field label="Webhook URL"><input className="input" type="url" placeholder="https://..." value={String(d.actionValue || '')} onChange={e => set('actionValue', e.target.value)} /></Field>}
          {d.actionType === 'notify' &&
            <Field label="Message"><textarea className="input resize-none" rows={3} placeholder="Notification text..." value={String(d.actionValue || '')} onChange={e => set('actionValue', e.target.value)} /></Field>}
        </>}
      </div>

      {/* Footer */}
      <div className="px-4 py-3.5 border-t border-sage-100 shrink-0">
        <button onClick={onClose} className="btn-primary w-full justify-center">
          <Check className="w-4 h-4" />
          Done
        </button>
      </div>
    </div>
  )
}
