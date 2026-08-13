import { useState } from 'react'
import { authApi, setToken } from '../api.js'

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await authApi.login(username.trim(), password)
      setToken(res.token)
      onSuccess()
    } catch (err) {
      setError(err.message || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-4 text-center text-2xl font-bold text-teal-800">诗词管理</h1>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-500">{error}</p>}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">用户名</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
