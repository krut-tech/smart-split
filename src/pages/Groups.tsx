import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface GroupSummary {
  id: string
  name: string
  created_at: string
  member_count: number
}

export default function Groups() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadGroups = async () => {
    setLoading(true)
    const { data: memberRows, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, created_at)')
      .eq('user_id', user?.id)

    if (memberErr) {
      setError(memberErr.message)
      setLoading(false)
      return
    }

    const groupList = (memberRows ?? [])
      .map((row: any) => row.groups)
      .filter(Boolean) as { id: string; name: string; created_at: string }[]

    // Get member counts
    const withCounts = await Promise.all(
      groupList.map(async (g) => {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
        return { ...g, member_count: count ?? 0 }
      })
    )

    setGroups(withCounts)
    setLoading(false)
  }

  useEffect(() => {
    if (user) loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim() || !user) return
    setCreating(true)
    setError('')

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({ name: newGroupName.trim(), created_by: user.id })
      .select()
      .single()

    if (groupErr || !group) {
      setError(groupErr?.message ?? 'Failed to create group')
      setCreating(false)
      return
    }

    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id })

    if (memberErr) {
      setError(memberErr.message)
      setCreating(false)
      return
    }

    setNewGroupName('')
    setShowCreate(false)
    setCreating(false)
    navigate(`/groups/${group.id}`)
  }

  return (
    <div className="min-h-screen bg-vault-bg text-white p-6 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold bg-vault-gradient bg-clip-text text-transparent">
          Smart Split
        </h1>
        <button
          onClick={signOut}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
        >
          Sign Out
        </button>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Your Groups</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg bg-vault-gradient font-medium hover:opacity-90 transition"
        >
          + New Group
        </button>
      </div>

      {showCreate && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={handleCreateGroup}
          className="mb-6 p-4 rounded-xl bg-vault-surface/60 border border-white/10 flex gap-3"
        >
          <input
            type="text"
            placeholder="Group name (e.g. Goa Trip)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-vault-gradient font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </motion.form>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading groups...</p>
      ) : groups.length === 0 ? (
        <div className="p-8 rounded-xl bg-vault-surface/40 border border-white/10 text-center">
          <p className="text-gray-400">No groups yet. Create one to start splitting expenses!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={`/groups/${g.id}`}
              className="p-5 rounded-xl bg-vault-surface/60 border border-white/10 hover:border-vault-cyan/50 transition group"
            >
              <h3 className="font-semibold text-lg mb-1 group-hover:text-vault-cyan transition">
                {g.name}
              </h3>
              <p className="text-gray-500 text-sm">{g.member_count} members</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
