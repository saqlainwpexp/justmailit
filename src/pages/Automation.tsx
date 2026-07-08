import { useCallback, useState, useRef, useEffect, type DragEvent } from 'react'
import {
  ReactFlow, addEdge, useNodesState, useEdgesState, Controls,
  Background, type Connection, type Node, type Edge,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Play, Pause, Zap, GitBranch, Users, X, Check, MoreHorizontal, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { nodeTypes, TOOLBOX_ITEMS } from './automation/FlowNodes'
import { useData, apiFetch } from '../lib/api'
import NodePanel from './automation/NodePanel'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface WorkflowMeta {
  id: number
  name: string
  status: 'active' | 'paused' | 'draft'
  enrolledCount: number
  nodes: Node[]
  edges: Edge[]
}

// â”€â”€ Seed data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EDGE_STYLE = { stroke: '#c8d4ba', strokeWidth: 1.5 }
const EDGE_LABEL_STYLE = { fontSize: 10, fontFamily: 'Inter, sans-serif', fontWeight: 600 }

const SEED: WorkflowMeta[] = [
  {
    id: 1, name: 'Welcome Sequence', status: 'active', enrolledCount: 124,
    nodes: [
      { id: '1', type: 'trigger',   position: { x: 260, y: 30  }, data: { label: 'Contact added to list',   subtitle: 'List: Warm Leads',          triggerType: 'list_added', triggerValue: 'Warm Leads' } },
      { id: '2', type: 'email',     position: { x: 260, y: 155 }, data: { label: 'Send welcome email',      subtitle: 'from: sales@keepmailing.com',    fromAccount: 'sales@keepmailing.com', subject: 'Welcome, {{first_name}}!' } },
      { id: '3', type: 'delay',     position: { x: 260, y: 280 }, data: { label: 'Wait 2 days',             subtitle: 'Then continue',             delayAmount: 2, delayUnit: 'days' } },
      { id: '4', type: 'condition', position: { x: 260, y: 405 }, data: { label: 'Email was opened?',       subtitle: 'Check open status',         conditionType: 'email_opened' } },
      { id: '5', type: 'email',     position: { x: 50,  y: 540 }, data: { label: 'Follow-up (not opened)', subtitle: 'from: sales@keepmailing.com',    fromAccount: 'sales@keepmailing.com' } },
      { id: '6', type: 'email',     position: { x: 470, y: 540 }, data: { label: 'Value email (opened)',    subtitle: 'from: sales@keepmailing.com',    fromAccount: 'sales@keepmailing.com' } },
      { id: '7', type: 'action',    position: { x: 470, y: 665 }, data: { label: 'Add tag',                 subtitle: 'Tag: engaged',              actionType: 'add_tag', actionValue: 'engaged' } },
    ],
    edges: [
      { id: 'e1', source: '1', target: '2', style: EDGE_STYLE },
      { id: 'e2', source: '2', target: '3', style: EDGE_STYLE },
      { id: 'e3', source: '3', target: '4', style: EDGE_STYLE },
      { id: 'e4', source: '4', target: '5', sourceHandle: 'no',  label: 'No',  style: { ...EDGE_STYLE, stroke: '#f0634a' }, labelStyle: { ...EDGE_LABEL_STYLE, fill: '#f0634a' } },
      { id: 'e5', source: '4', target: '6', sourceHandle: 'yes', label: 'Yes', style: { ...EDGE_STYLE, stroke: '#1a2e20' }, labelStyle: { ...EDGE_LABEL_STYLE, fill: '#1a2e20' } },
      { id: 'e6', source: '6', target: '7', style: EDGE_STYLE },
    ],
  },
  {
    id: 2, name: 'Cold Outreach', status: 'active', enrolledCount: 88,
    nodes: [
      { id: '1', type: 'trigger', position: { x: 260, y: 30  }, data: { label: 'Tag added: cold-lead', subtitle: 'Tag: cold-lead', triggerType: 'tag_added', triggerValue: 'cold-lead' } },
      { id: '2', type: 'email',   position: { x: 260, y: 155 }, data: { label: 'First outreach',       subtitle: 'from: outreach@keepmailing.com', fromAccount: 'outreach@keepmailing.com' } },
      { id: '3', type: 'delay',   position: { x: 260, y: 280 }, data: { label: 'Wait 3 days',          subtitle: 'Then continue', delayAmount: 3, delayUnit: 'days' } },
      { id: '4', type: 'email',   position: { x: 260, y: 405 }, data: { label: 'Follow-up #2',         subtitle: 'from: outreach@keepmailing.com', fromAccount: 'outreach@keepmailing.com' } },
      { id: '5', type: 'delay',   position: { x: 260, y: 530 }, data: { label: 'Wait 5 days',          subtitle: 'Then continue', delayAmount: 5, delayUnit: 'days' } },
      { id: '6', type: 'email',   position: { x: 260, y: 655 }, data: { label: 'Final follow-up',      subtitle: 'from: outreach@keepmailing.com', fromAccount: 'outreach@keepmailing.com' } },
    ],
    edges: [
      { id: 'e1', source: '1', target: '2', style: EDGE_STYLE },
      { id: 'e2', source: '2', target: '3', style: EDGE_STYLE },
      { id: 'e3', source: '3', target: '4', style: EDGE_STYLE },
      { id: 'e4', source: '4', target: '5', style: EDGE_STYLE },
      { id: 'e5', source: '5', target: '6', style: EDGE_STYLE },
    ],
  },
  {
    id: 3, name: 'Re-engagement', status: 'paused', enrolledCount: 0,
    nodes: [
      { id: '1', type: 'trigger',   position: { x: 260, y: 30  }, data: { label: 'New contact created',   subtitle: 'Any new contact', triggerType: 'contact_created' } },
      { id: '2', type: 'email',     position: { x: 260, y: 155 }, data: { label: 'Re-engagement email',   subtitle: 'from: hello@keepmailing.com', fromAccount: 'hello@keepmailing.com' } },
      { id: '3', type: 'condition', position: { x: 260, y: 280 }, data: { label: 'Replied to email?',     subtitle: 'Check reply', conditionType: 'replied' } },
      { id: '4', type: 'action',    position: { x: 50,  y: 415 }, data: { label: 'Add tag: re-engaged',  subtitle: 'Tag: re-engaged', actionType: 'add_tag', actionValue: 're-engaged' } },
      { id: '5', type: 'action',    position: { x: 470, y: 415 }, data: { label: 'Add tag: no-reply',    subtitle: 'Tag: no-reply', actionType: 'add_tag', actionValue: 'no-reply' } },
    ],
    edges: [
      { id: 'e1', source: '1', target: '2', style: EDGE_STYLE },
      { id: 'e2', source: '2', target: '3', style: EDGE_STYLE },
      { id: 'e3', source: '3', target: '4', sourceHandle: 'yes', label: 'Yes', style: { ...EDGE_STYLE, stroke: '#1a2e20' }, labelStyle: { ...EDGE_LABEL_STYLE, fill: '#1a2e20' } },
      { id: 'e4', source: '3', target: '5', sourceHandle: 'no',  label: 'No',  style: { ...EDGE_STYLE, stroke: '#f0634a' }, labelStyle: { ...EDGE_LABEL_STYLE, fill: '#f0634a' } },
    ],
  },
]

// â”€â”€ Canvas (inner â€” needs useReactFlow) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CanvasProps {
  workflow: WorkflowMeta
  onSave: (nodes: Node[], edges: Edge[]) => void
  onToggleStatus: () => void
}

function AutomationCanvas({ workflow, onSave, onToggleStatus }: CanvasProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dragType = useRef<string | null>(null)

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, style: EDGE_STYLE }, eds)),
    [setEdges]
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const type = dragType.current
    if (!type) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const DEFAULTS: Record<string, { label: string; subtitle: string }> = {
      email:     { label: 'Send email',       subtitle: 'Click to configure' },
      delay:     { label: 'Wait 1 day',       subtitle: 'Then continue to next step' },
      condition: { label: 'Check condition',  subtitle: 'Click to configure' },
      action:    { label: 'Add tag',          subtitle: 'Click to configure' },
    }
    setNodes(nds => [...nds, {
      id: `n_${Date.now()}`,
      type,
      position: pos,
      data: DEFAULTS[type] || { label: type, subtitle: '' },
    }])
    dragType.current = null
  }, [screenToFlowPosition, setNodes])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id)
  }, [])

  const onPaneClick = useCallback(() => setSelectedId(null), [])

  const onNodeDataChange = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data } : n))
  }, [setNodes])

  const handleSave = () => {
    onSave(nodes, edges)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null
  const isActive = workflow.status === 'active'

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-sage-100 shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-forest truncate">{workflow.name}</p>
            <p className="text-[10px] text-sage-400 mt-0.5">{nodes.length} steps Â· {workflow.enrolledCount} enrolled</p>
          </div>
          <div className={cn(
            'shrink-0 inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full',
            isActive ? 'bg-green-50 text-green-700' : workflow.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-sage-100 text-sage-500'
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : workflow.status === 'paused' ? 'bg-amber-400' : 'bg-sage-400')} />
            {workflow.status === 'active' ? 'Active' : workflow.status === 'paused' ? 'Paused' : 'Draft'}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[10px] text-sage-400 hidden lg:block">Drag to canvas:</p>
          {TOOLBOX_ITEMS.map(item => (
            <div
              key={item.type}
              draggable
              onDragStart={() => { dragType.current = item.type }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-sage-700',
                'bg-white hover:shadow-card transition-all cursor-grab active:cursor-grabbing select-none',
                item.border
              )}
            >
              <div className={cn('w-4 h-4 rounded flex items-center justify-center', item.bg)}>
                <item.icon className={cn('w-2.5 h-2.5', item.color)} />
              </div>
              {item.label}
            </div>
          ))}
          <div className="w-px h-5 bg-sage-200 mx-0.5" />
          <button onClick={onToggleStatus} className="btn-ghost text-xs px-3 py-1.5">
            {isActive ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Activate</>}
          </button>
          <button
            onClick={handleSave}
            className={cn('btn-primary text-xs px-3 py-1.5 transition-colors', saved && '!bg-green-600')}
          >
            {saved ? <><Check className="w-3.5 h-3.5" />Saved!</> : <><Play className="w-3.5 h-3.5" />Save & Run</>}
          </button>
        </div>
      </div>

      {/* Canvas row */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode="Delete"
          >
            <Background color="#e4e9dd" gap={20} size={1} />
            <Controls className="!border-sage-100 !shadow-card !rounded-xl overflow-hidden" showInteractive={false} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodePanel
            node={selectedNode}
            onChange={onNodeDataChange}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Automation() {
  const { data: rawWorkflows, loading, reload } = useData<WorkflowMeta[]>('/api/automations')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [menuId, setMenuId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [localOverrides, setLocalOverrides] = useState<Record<number, Partial<WorkflowMeta>>>({})

  const workflows: WorkflowMeta[] = (rawWorkflows || []).map(w => ({ ...w, ...localOverrides[w.id] }))

  useEffect(() => {
    if (rawWorkflows && rawWorkflows.length > 0 && !activeId) {
      setActiveId(rawWorkflows[0].id)
    }
  }, [rawWorkflows])

  const active = workflows.find(w => w.id === activeId) ?? workflows[0]

  const createWorkflow = async () => {
    const name = newName.trim() || 'New Workflow'
    const created = await apiFetch<WorkflowMeta>('/api/automations', {
      json: {
        name, status: 'draft',
        nodes: [{ id: '1', type: 'trigger', position: { x: 220, y: 40 }, data: { label: 'Contact added to list', subtitle: 'Click to configure', triggerType: 'list_added' } }],
        edges: [],
      }
    })
    setNewName(''); setShowNewModal(false)
    await reload()
    setActiveId(created.id)
  }

  const deleteWf = async (id: number) => {
    await apiFetch(`/api/automations/${id}`, { method: 'DELETE' })
    setMenuId(null)
    const remaining = workflows.filter(w => w.id !== id)
    if (activeId === id) setActiveId(remaining[0]?.id ?? null)
    reload()
  }

  const duplicateWf = async (id: number) => {
    const src = workflows.find(w => w.id === id)!
    const created = await apiFetch<WorkflowMeta>('/api/automations', {
      json: { name: `${src.name} (copy)`, status: 'draft', nodes: src.nodes, edges: src.edges }
    })
    setMenuId(null); reload(); setActiveId(created.id)
  }

  const toggleStatus = async (id: number) => {
    const updated = await apiFetch<WorkflowMeta>(`/api/automations/${id}/toggle`, { method: 'POST' })
    setLocalOverrides(o => ({ ...o, [id]: { ...o[id], status: updated.status } }))
    setMenuId(null)
  }

  const finishRename = async () => {
    if (renamingId && renameVal.trim()) {
      await apiFetch(`/api/automations/${renamingId}`, { method: 'PUT', json: { name: renameVal.trim() } })
      setLocalOverrides(o => ({ ...o, [renamingId]: { ...o[renamingId], name: renameVal.trim() } }))
    }
    setRenamingId(null)
  }

  const onSave = async (id: number, nodes: Node[], edges: Edge[]) => {
    await apiFetch(`/api/automations/${id}`, { method: 'PUT', json: { nodes, edges } })
    setLocalOverrides(o => ({ ...o, [id]: { ...o[id], nodes, edges } }))
  }

  const totalEnrolled = workflows.reduce((s, w) => s + (w.enrolledCount || 0), 0)
  const activeCount   = workflows.filter(w => w.status === 'active').length

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 text-forest animate-spin"/></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Automation</h1>
          <p className="page-subtitle">Build visual email sequences with branching logic</p>
        </div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New workflow
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active workflows', value: String(activeCount),    icon: Zap,       color: 'text-forest'    },
          { label: 'Total enrolled',   value: String(totalEnrolled),  icon: Users,     color: 'text-blue-600'  },
          { label: 'Total workflows',  value: String(workflows.length), icon: GitBranch, color: 'text-purple-600'},
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center shrink-0">
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-xs text-sage-500 font-medium">{s.label}</p>
              <p className="text-xl font-bold text-forest mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex gap-5" style={{ height: '680px' }}>

        {/* Workflow sidebar */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-sage-500 uppercase tracking-wider px-1 mb-1">Workflows</p>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {workflows.map(w => (
              <div
                key={w.id}
                className={cn(
                  'relative rounded-xl border transition-all',
                  activeId === w.id
                    ? 'border-forest/20 bg-white shadow-card'
                    : 'border-transparent bg-white/70 hover:bg-white hover:shadow-card'
                )}
              >
                {renamingId === w.id ? (
                  <div className="p-3">
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={finishRename}
                      onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenamingId(null) }}
                      className="input py-1 text-xs w-full"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 cursor-pointer" onClick={() => setActiveId(w.id)}>
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-forest leading-snug flex-1 min-w-0">{w.name}</p>
                      <div
                        className="shrink-0 w-5 h-5 rounded hover:bg-sage-100 flex items-center justify-center"
                        onClick={e => { e.stopPropagation(); setMenuId(menuId === w.id ? null : w.id) }}
                      >
                        <MoreHorizontal className="w-3 h-3 text-sage-400" />
                      </div>
                    </div>
                    <p className="text-[10px] text-sage-400 mt-1">
                      {w.nodes.length} steps Â· {w.enrolledCount} enrolled
                    </p>
                    <div className={cn(
                      'mt-2 inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                      w.status === 'active' ? 'bg-green-50 text-green-700' :
                      w.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-sage-100 text-sage-500'
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full',
                        w.status === 'active' ? 'bg-green-500' : w.status === 'paused' ? 'bg-amber-400' : 'bg-sage-400'
                      )} />
                      {w.status}
                    </div>
                  </div>
                )}

                {/* Context menu */}
                {menuId === w.id && (
                  <div className="absolute right-0 top-9 z-30 bg-white border border-sage-200 rounded-xl shadow-card-hover min-w-[148px] py-1 overflow-hidden">
                    {[
                      { label: 'Rename',    action: () => { setRenameVal(w.name); setRenamingId(w.id); setMenuId(null) } },
                      { label: 'Duplicate', action: () => duplicateWf(w.id) },
                      { label: w.status === 'active' ? 'Pause' : 'Activate', action: () => toggleStatus(w.id) },
                      { label: 'Delete',    action: () => deleteWf(w.id), danger: true },
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={e => { e.stopPropagation(); item.action() }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs transition-colors',
                          item.danger ? 'text-red-600 hover:bg-red-50' : 'text-sage-700 hover:bg-sage-50'
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas card */}
        <div className="flex-1 bg-white rounded-2xl border border-sage-100 shadow-card overflow-hidden flex flex-col">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-forest/10 flex items-center justify-center">
                <Zap className="w-7 h-7 text-forest" />
              </div>
              <div>
                <p className="text-sm font-semibold text-sage-800 mb-1">No workflows yet</p>
                <p className="text-xs text-sage-400 max-w-xs">Create your first workflow to start automating your email sequences.</p>
              </div>
              <button onClick={() => setShowNewModal(true)} className="btn-primary mt-2">
                <Plus className="w-4 h-4" />New workflow
              </button>
            </div>
          ) : (
            <ReactFlowProvider>
              <AutomationCanvas
                key={activeId}
                workflow={active}
                onSave={(n, e) => onSave(activeId!, n, e)}
                onToggleStatus={() => toggleStatus(activeId!)}
              />
            </ReactFlowProvider>
          )}
        </div>
      </div>

      {/* New workflow modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-forest">New workflow</h2>
              <button onClick={() => setShowNewModal(false)} className="w-7 h-7 rounded-lg hover:bg-sage-100 flex items-center justify-center">
                <X className="w-4 h-4 text-sage-500" />
              </button>
            </div>
            <div>
              <label className="label">Workflow name</label>
              <input
                autoFocus
                className="input"
                placeholder="e.g. Cold Outreach Sequence"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createWorkflow() }}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNewModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={createWorkflow} className="btn-primary flex-1 justify-center">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for context menus */}
      {menuId !== null && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
      )}
    </div>
  )
}
