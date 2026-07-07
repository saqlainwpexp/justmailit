import { Handle, Position, NodeToolbar, type NodeProps, useReactFlow } from '@xyflow/react'
import { Zap, Mail, Clock, GitBranch, Tag, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'

type NType = 'trigger' | 'email' | 'delay' | 'condition' | 'action'

const META: Record<NType, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  border: string
  badge: string
}> = {
  trigger:   { icon: Zap,       color: 'text-forest',    bg: 'bg-forest/10',   border: 'border-forest/30',   badge: 'TRIGGER'    },
  email:     { icon: Mail,      color: 'text-coral',     bg: 'bg-coral/10',    border: 'border-coral/30',    badge: 'SEND EMAIL' },
  delay:     { icon: Clock,     color: 'text-amber-600', bg: 'bg-amber-100',   border: 'border-amber-300',   badge: 'WAIT'       },
  condition: { icon: GitBranch, color: 'text-purple-600',bg: 'bg-purple-100',  border: 'border-purple-300',  badge: 'CONDITION'  },
  action:    { icon: Tag,       color: 'text-blue-600',  bg: 'bg-blue-100',    border: 'border-blue-300',    badge: 'ACTION'     },
}

function FlowNode({ id, data, selected, ntype }: NodeProps & { ntype: NType }) {
  const { setNodes, setEdges } = useReactFlow()
  const m = META[ntype]
  const Icon = m.icon

  const deleteNode = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNodes(ns => ns.filter(n => n.id !== id))
    setEdges(es => es.filter(e => e.source !== id && e.target !== id))
  }

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <button
          onClick={deleteNode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg shadow-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete node
        </button>
      </NodeToolbar>

      {ntype !== 'trigger' && (
        <Handle type="target" position={Position.Top}
          className="!w-3 !h-3 !bg-white !border-2 !border-sage-300 !rounded-full"
        />
      )}

      <div className={cn(
        'min-w-[210px] max-w-[250px] rounded-xl border-2 bg-white transition-all duration-150 cursor-pointer',
        m.border,
        selected ? 'shadow-lg ring-2 ring-forest/20 ring-offset-2' : 'shadow-card hover:shadow-card-hover'
      )}>
        <div className="p-3.5">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', m.bg)}>
              <Icon className={cn('w-4 h-4', m.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[9px] font-bold uppercase tracking-widest leading-none', m.color)}>{m.badge}</p>
              <p className="text-xs font-semibold text-forest mt-0.5 leading-tight">{String(data.label || '')}</p>
            </div>
          </div>
          {data.subtitle && (
            <p className="text-[10px] text-sage-400 mt-1.5 leading-snug pl-[42px]">
              {String(data.subtitle)}
            </p>
          )}
        </div>
      </div>

      {ntype === 'condition' ? (
        <>
          <Handle type="source" position={Position.Bottom} id="yes"
            style={{ left: '25%' }}
            className="!w-3 !h-3 !bg-white !border-2 !border-green-400 !rounded-full"
          />
          <Handle type="source" position={Position.Bottom} id="no"
            style={{ left: '75%' }}
            className="!w-3 !h-3 !bg-white !border-2 !border-red-400 !rounded-full"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom}
          className="!w-3 !h-3 !bg-white !border-2 !border-sage-300 !rounded-full"
        />
      )}
    </>
  )
}

export const nodeTypes = {
  trigger:   (p: NodeProps) => <FlowNode {...p} ntype="trigger" />,
  email:     (p: NodeProps) => <FlowNode {...p} ntype="email" />,
  delay:     (p: NodeProps) => <FlowNode {...p} ntype="delay" />,
  condition: (p: NodeProps) => <FlowNode {...p} ntype="condition" />,
  action:    (p: NodeProps) => <FlowNode {...p} ntype="action" />,
}

export const TOOLBOX_ITEMS = [
  { type: 'email',     icon: Mail,      label: 'Email',     color: 'text-coral',     bg: 'bg-coral/10',   border: 'border-coral/20'   },
  { type: 'delay',     icon: Clock,     label: 'Wait',      color: 'text-amber-600', bg: 'bg-amber-100',  border: 'border-amber-200'  },
  { type: 'condition', icon: GitBranch, label: 'Condition', color: 'text-purple-600',bg: 'bg-purple-100', border: 'border-purple-200' },
  { type: 'action',    icon: Tag,       label: 'Action',    color: 'text-blue-600',  bg: 'bg-blue-100',   border: 'border-blue-200'   },
] as const
