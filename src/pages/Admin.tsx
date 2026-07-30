import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface UserRow {
  id: string
  full_name: string | null
  email: string | null
  role: string
  created_at: string
}

interface GroupRow {
  id: string
  name: string
  created_at: string
  member_count: number
  expense_count: number
}

interface ExpenseRow {
  id: string
  title: string
  amount: number
  category: string
  created_at: string
  group_name: string
  payer_name: string
}

type Tab = 'overview' | 'users' | 'groups' | 'expenses'

export default function Admin() {
  const { user } = useAuth()
  const [checkingRole, setCheckingRole] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  const [users, setUsers] = useState<UserRow[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Check admin role
  useEffect(() => {
    const check = async () => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(data?.role === 'admin')
      setCheckingRole(false)
    }
    check()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    setError('')

    const { data: userRows, error: userErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false })

    if (userErr) setError(userErr.message)
    setUsers(userRows ?? [])

    const { data: groupRows } = await supabase
      .from('groups')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })

    const groupsWithCounts = await Promise.all(
      (groupRows ?? []).map(async (g) => {
        const { count: memberCount } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
        const { count: expenseCount } = await supabase
          .from('expenses')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
        return { ...g, member_count: memberCount ?? 0, expense_count: expenseCount ?? 0 }
      })
    )
    setGroups(groupsWithCounts)

    const { data: expenseRows } = await supabase
      .from('expenses')
      .select('id, title, amount, category, created_at, group_id, paid_by')
      .order('created_at', { ascending: false })
      .limit(100)

    const groupNameMap = new Map(groupsWithCounts.map((g) => [g.id, g.name]))
    const userNameMap = new Map((userRows ?? []).map((u) => [u.id, u.full_name || u.email || 'Unknown']))

    const expensesWithNames: ExpenseRow[] = (expenseRows ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      created_at: e.created_at,
      group_name: groupNameMap.get(e.group_id) || 'Unknown group',
      payer_name: userNameMap.get(e.paid_by) || 'Unknown user',
    }))
    setExpenses(expensesWithNames)

    setLoading(false)
  }

  useEffect(() => {
    if (isAdmin) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const toggleRole = async (targetUser: UserRow) => {
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin'
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUser.id)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    loadData()
  }

  const deleteGroup = async (groupId: string) => {
    if (!confirm('Delete this group and all its expenses? This cannot be undone.')) return
    await supabase.from('groups').delete().eq('id', groupId)
    loadData()
  }

  if (checkingRole) {
    return <div className="min-h-screen bg-vault-bg text-white p-8">Checking access...</div>
  }

  if (!isAdmin) {
    return <Navigate to="/groups" replace />
  }

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="min-h-screen bg-vault-bg text-white p-6 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/groups" className="text-vault-cyan hover:underline text-sm">
            ← Back to app
          </Link>
          <h1 className="text-3xl font-bold mt-2 bg-vault-gradient bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-white/10 pb-2">
        {(['overview', 'users', 'groups', 'expenses'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm capitalize transition ${
              tab === t ? 'bg-vault-gradient font-medium' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading data...</p>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={users.length} />
              <StatCard label="Total Groups" value={groups.length} />
              <StatCard label="Total Expenses" value={expenses.length} />
              <StatCard label="Total Tracked" value={`₹${totalExpenseAmount.toFixed(2)}`} />
            </div>
          )}

          {tab === 'users' && (
            <div className="rounded-xl bg-vault-surface/60 border border-white/10 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Joined</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5">
                      <td className="p-3">{u.full_name || '—'}</td>
                      <td className="p-3 text-gray-400">{u.email}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            u.role === 'admin' ? 'bg-vault-gradient' : 'bg-white/10 text-gray-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleRole(u)}
                          className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition"
                        >
                          {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'groups' && (
            <div className="rounded-xl bg-vault-surface/60 border border-white/10 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="p-3">Name</th>
                    <th className="p-3">Members</th>
                    <th className="p-3">Expenses</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-b border-white/5">
                      <td className="p-3">{g.name}</td>
                      <td className="p-3 text-gray-400">{g.member_count}</td>
                      <td className="p-3 text-gray-400">{g.expense_count}</td>
                      <td className="p-3 text-gray-500">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <button
                          onClick={() => deleteGroup(g.id)}
                          className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'expenses' && (
            <div className="rounded-xl bg-vault-surface/60 border border-white/10 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="p-3">Title</th>
                    <th className="p-3">Group</th>
                    <th className="p-3">Paid By</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-white/5">
                      <td className="p-3">{e.title}</td>
                      <td className="p-3 text-gray-400">{e.group_name}</td>
                      <td className="p-3 text-gray-400">{e.payer_name}</td>
                      <td className="p-3 text-gray-400">{e.category}</td>
                      <td className="p-3 text-vault-cyan">₹{e.amount.toFixed(2)}</td>
                      <td className="p-3 text-gray-500">{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-5 rounded-xl bg-vault-surface/60 border border-white/10">
      <p className="text-gray-500 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold bg-vault-gradient bg-clip-text text-transparent">{value}</p>
    </div>
  )
}
