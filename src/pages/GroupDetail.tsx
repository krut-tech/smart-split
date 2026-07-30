import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeBalances, type ExpenseRow, type SplitRow } from '../lib/balances'

interface Profile {
  id: string
  full_name: string | null
  email: string | null
}

interface ExpenseWithSplits extends ExpenseRow {
  title: string
  category: string
  split_type: string
  created_at: string
  splits: SplitRow[]
}

type SplitMode = 'equal' | 'custom' | 'percentage'

export default function GroupDetail() {
  const { id: groupId } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [groupName, setGroupName] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Invite member
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // Add expense
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('general')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const loadGroup = async () => {
    if (!groupId) return
    setLoading(true)
    setError('')

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single()

    if (groupErr || !group) {
      setError('Group not found or you do not have access.')
      setLoading(false)
      return
    }
    setGroupName(group.name)

    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id, profiles(id, full_name, email)')
      .eq('group_id', groupId)

    const memberProfiles = (memberRows ?? [])
      .map((r: any) => r.profiles)
      .filter(Boolean) as Profile[]
    setMembers(memberProfiles)

    const { data: expenseRows } = await supabase
      .from('expenses')
      .select('id, paid_by, title, amount, category, split_type, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    const expenseIds = (expenseRows ?? []).map((e) => e.id)
    let splitRows: SplitRow[] = []
    if (expenseIds.length > 0) {
      const { data } = await supabase
        .from('expense_splits')
        .select('id, expense_id, user_id, amount_owed, settled')
        .in('expense_id', expenseIds)
      splitRows = data ?? []
    }

    const withSplits: ExpenseWithSplits[] = (expenseRows ?? []).map((e) => ({
      ...e,
      splits: splitRows.filter((s) => s.expense_id === e.id),
    }))

    setExpenses(withSplits)
    setLoading(false)
  }

  useEffect(() => {
    loadGroup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !groupId) return
    setInviting(true)
    setError('')

    const { data: profile, error: findErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', inviteEmail.trim())
      .maybeSingle()

    if (findErr || !profile) {
      setError('No user found with that email. They need to sign up first.')
      setInviting(false)
      return
    }

    const { error: addErr } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: profile.id })

    if (addErr) {
      setError(addErr.message.includes('duplicate') ? 'User is already a member.' : addErr.message)
      setInviting(false)
      return
    }

    setInviteEmail('')
    setInviting(false)
    loadGroup()
  }

  const resetExpenseForm = () => {
    setTitle('')
    setAmount('')
    setCategory('general')
    setSplitMode('equal')
    setCustomAmounts({})
    setPercentages({})
  }

  const handleAddExpense = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupId || !user || !title.trim() || !amount) return
    const totalAmount = parseFloat(amount)
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setError('Enter a valid amount.')
      return
    }

    // Compute per-member shares
    const shares: Record<string, number> = {}

    if (splitMode === 'equal') {
      const share = totalAmount / members.length
      members.forEach((m) => (shares[m.id] = share))
    } else if (splitMode === 'custom') {
      let sum = 0
      members.forEach((m) => {
        const v = parseFloat(customAmounts[m.id] || '0')
        shares[m.id] = v
        sum += v
      })
      if (Math.abs(sum - totalAmount) > 0.01) {
        setError(`Custom amounts must add up to ₹${totalAmount.toFixed(2)}. Currently: ₹${sum.toFixed(2)}`)
        return
      }
    } else {
      let sumPct = 0
      members.forEach((m) => {
        const v = parseFloat(percentages[m.id] || '0')
        sumPct += v
        shares[m.id] = (v / 100) * totalAmount
      })
      if (Math.abs(sumPct - 100) > 0.01) {
        setError(`Percentages must add up to 100%. Currently: ${sumPct.toFixed(1)}%`)
        return
      }
    }

    setSubmitting(true)
    setError('')

    const { data: expense, error: expenseErr } = await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        paid_by: user.id,
        title: title.trim(),
        amount: totalAmount,
        category,
        split_type: splitMode,
      })
      .select()
      .single()

    if (expenseErr || !expense) {
      setError(expenseErr?.message ?? 'Failed to add expense')
      setSubmitting(false)
      return
    }

    const splitInserts = members.map((m) => ({
      expense_id: expense.id,
      user_id: m.id,
      amount_owed: Math.round(shares[m.id] * 100) / 100,
      settled: m.id === user.id, // payer's own share is auto-settled
    }))

    const { error: splitErr } = await supabase.from('expense_splits').insert(splitInserts)

    if (splitErr) {
      setError(splitErr.message)
      setSubmitting(false)
      return
    }

    resetExpenseForm()
    setShowAddExpense(false)
    setSubmitting(false)
    loadGroup()
  }

  const markSettled = async (splitId: string) => {
    await supabase
      .from('expense_splits')
      .update({ settled: true, settled_at: new Date().toISOString() })
      .eq('id', splitId)
    loadGroup()
  }

  const nameFor = (userId: string) => {
    const m = members.find((mem) => mem.id === userId)
    return m?.full_name || m?.email || 'Unknown'
  }

  const allSplits = expenses.flatMap((e) => e.splits)
  const balances = computeBalances(expenses, allSplits)
  const myBalance = user ? balances[user.id] : undefined

  if (loading) {
    return <div className="min-h-screen bg-vault-bg text-white p-8">Loading...</div>
  }

  if (error && !groupName) {
    return (
      <div className="min-h-screen bg-vault-bg text-white p-8">
        <Link to="/groups" className="text-vault-cyan hover:underline">
          ← Back to groups
        </Link>
        <p className="mt-4 text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-vault-bg text-white p-6 md:p-8">
      <Link to="/groups" className="text-vault-cyan hover:underline text-sm">
        ← Back to groups
      </Link>

      <h1 className="text-3xl font-bold mt-2 mb-6 bg-vault-gradient bg-clip-text text-transparent">
        {groupName}
      </h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left column: members + invite + balance */}
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-vault-surface/60 border border-white/10">
            <h2 className="font-semibold mb-3">Members ({members.length})</h2>
            <ul className="space-y-2 mb-4">
              {members.map((m) => (
                <li key={m.id} className="text-gray-300 text-sm">
                  {m.full_name || m.email} {m.id === user?.id && <span className="text-vault-cyan">(you)</span>}
                </li>
              ))}
            </ul>
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="email"
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
              />
              <button
                type="submit"
                disabled={inviting}
                className="px-3 py-2 rounded-lg bg-vault-gradient text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>

          {myBalance && (
            <div className="p-5 rounded-xl bg-vault-surface/60 border border-white/10">
              <h2 className="font-semibold mb-3">Your Balance</h2>
              <p className={`text-2xl font-bold ${myBalance.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {myBalance.net >= 0 ? '+' : ''}₹{myBalance.net.toFixed(2)}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {myBalance.net >= 0 ? 'You are owed overall' : 'You owe overall'}
              </p>
              <div className="mt-3 text-sm text-gray-400 space-y-1">
                <p>You owe: ₹{myBalance.youOwe.toFixed(2)}</p>
                <p>Owed to you: ₹{myBalance.owedToYou.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right column: expenses */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-lg">Expenses</h2>
            <button
              onClick={() => setShowAddExpense(!showAddExpense)}
              className="px-4 py-2 rounded-lg bg-vault-gradient text-sm font-medium hover:opacity-90 transition"
            >
              + Add Expense
            </button>
          </div>

          {showAddExpense && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleAddExpense}
              className="p-5 rounded-xl bg-vault-surface/60 border border-white/10 space-y-4"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Title (e.g. Dinner)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount (₹)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
                />
              </div>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:border-vault-cyan transition"
              >
                <option value="general">General</option>
                <option value="food">Food</option>
                <option value="travel">Travel</option>
                <option value="rent">Rent</option>
                <option value="shopping">Shopping</option>
              </select>

              <div className="flex gap-2">
                {(['equal', 'custom', 'percentage'] as SplitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${
                      splitMode === mode
                        ? 'bg-vault-gradient font-medium'
                        : 'bg-white/5 border border-white/10 text-gray-400'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {splitMode === 'custom' && (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-32 truncate">{m.full_name || m.email}</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="₹0"
                        value={customAmounts[m.id] || ''}
                        onChange={(e) => setCustomAmounts({ ...customAmounts, [m.id]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
                      />
                    </div>
                  ))}
                </div>
              )}

              {splitMode === 'percentage' && (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-32 truncate">{m.full_name || m.email}</span>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0%"
                        value={percentages[m.id] || ''}
                        onChange={(e) => setPercentages({ ...percentages, [m.id]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder-gray-500 focus:outline-none focus:border-vault-cyan transition"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-vault-gradient font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Expense'}
              </button>
            </motion.form>
          )}

          {expenses.length === 0 ? (
            <div className="p-8 rounded-xl bg-vault-surface/40 border border-white/10 text-center text-gray-400">
              No expenses yet. Add the first one!
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((e) => (
                <div key={e.id} className="p-4 rounded-xl bg-vault-surface/60 border border-white/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-sm text-gray-500">
                        Paid by {nameFor(e.paid_by)} · {e.category}
                      </p>
                    </div>
                    <p className="font-semibold text-vault-cyan">₹{e.amount.toFixed(2)}</p>
                  </div>
                  <div className="mt-3 space-y-1">
                    {e.splits
                      .filter((s) => s.user_id !== e.paid_by)
                      .map((s) => (
                        <div key={s.id} className="flex justify-between items-center text-sm">
                          <span className="text-gray-400">
                            {nameFor(s.user_id)} owes ₹{s.amount_owed.toFixed(2)}
                          </span>
                          {s.settled ? (
                            <span className="text-green-400 text-xs">Settled</span>
                          ) : s.user_id === user?.id ? (
                            <button
                              onClick={() => markSettled(s.id)}
                              className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition"
                            >
                              Mark as paid
                            </button>
                          ) : (
                            <span className="text-yellow-400 text-xs">Pending</span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
