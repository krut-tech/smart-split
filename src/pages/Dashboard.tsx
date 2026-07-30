import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-vault-bg text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold bg-vault-gradient bg-clip-text text-transparent">
          Smart Split
        </h1>
        <button
          onClick={signOut}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Sign Out
        </button>
      </div>

      <div className="p-6 rounded-2xl bg-vault-surface/60 backdrop-blur-xl border border-white/10">
        <p className="text-gray-400">Welcome, {user?.email}</p>
        <p className="mt-4 text-gray-500 text-sm">Groups feature coming in Phase 3...</p>
      </div>
    </div>
  )
}
