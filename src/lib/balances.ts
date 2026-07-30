export interface SplitRow {
  id: string
  expense_id: string
  user_id: string
  amount_owed: number
  settled: boolean
}

export interface ExpenseRow {
  id: string
  paid_by: string
  amount: number
  title: string
}

export interface MemberBalance {
  userId: string
  youOwe: number // total this member owes to others (unsettled)
  owedToYou: number // total others owe this member (unsettled, on expenses they paid)
  net: number // owedToYou - youOwe
}

/**
 * Computes net balances per member from raw expenses + splits.
 * Assumes: for each expense, a split row exists for every group member
 * (including the payer, whose row is created pre-settled).
 */
export function computeBalances(
  expenses: ExpenseRow[],
  splits: SplitRow[]
): Record<string, MemberBalance> {
  const balances: Record<string, MemberBalance> = {}

  const ensure = (id: string) => {
    if (!balances[id]) {
      balances[id] = { userId: id, youOwe: 0, owedToYou: 0, net: 0 }
    }
    return balances[id]
  }

  const expenseById = new Map(expenses.map((e) => [e.id, e]))

  for (const split of splits) {
    if (split.settled) continue
    const expense = expenseById.get(split.expense_id)
    if (!expense) continue

    // The split's user owes this amount
    ensure(split.user_id).youOwe += split.amount_owed
    // The payer of that expense is owed this amount
    ensure(expense.paid_by).owedToYou += split.amount_owed
  }

  for (const b of Object.values(balances)) {
    b.net = b.owedToYou - b.youOwe
  }

  return balances
}
