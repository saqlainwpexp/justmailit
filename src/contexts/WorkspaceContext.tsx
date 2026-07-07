import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from './AuthContext'

export interface Workspace {
  id: number
  name: string
  role: 'owner' | 'member'
  plan: string
  isActive: boolean
}

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  switchWorkspace: (id: number) => Promise<void>
  createWorkspace: (name: string) => Promise<Workspace>
  reload: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user) { setWorkspaces([]); setLoading(false); return }
    setLoading(true)
    try {
      const list = await apiFetch<Workspace[]>('/api/workspaces')
      setWorkspaces(list)
    } catch {
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { reload() }, [reload])

  const switchWorkspace = useCallback(async (id: number) => {
    await apiFetch(`/api/workspaces/${id}/switch`, { method: 'POST' })
    await reload()
  }, [reload])

  const createWorkspace = useCallback(async (name: string) => {
    const ws = await apiFetch<Workspace>('/api/workspaces', { json: { name } })
    await reload()
    return ws
  }, [reload])

  const activeWorkspace = workspaces.find(w => w.isActive) || workspaces[0] || null

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, loading, switchWorkspace, createWorkspace, reload }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
