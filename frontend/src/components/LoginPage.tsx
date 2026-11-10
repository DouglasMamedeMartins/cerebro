import { useState, type FormEvent } from 'react'
import { LockKeyhole, LogIn } from 'lucide-react'
import { ApiError, authApi, type Candidate } from '../services/api'

interface LoginPageProps {
  onAuthenticated: (candidate: Candidate) => void
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      onAuthenticated(await authApi.login({ email, password }))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError('E-mail ou senha inválidos.')
      } else if (cause instanceof ApiError && cause.kind === 'network') {
        setError('Não foi possível conectar. Verifique sua conexão e tente novamente.')
      } else {
        setError('Não foi possível entrar agora. Tente novamente em instantes.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="brand-name">PMDF <span>CÉREBRO</span></div>
        </div>
        <div className="auth-icon"><LockKeyhole size={20} aria-hidden="true" /></div>
        <p className="auth-eyebrow">ÁREA DO CANDIDATO</p>
        <h1 id="login-title">Acesse sua conta</h1>
        <p className="auth-description">Entre para continuar sua preparação.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={submitting}
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
            {!submitting && <LogIn size={16} aria-hidden="true" />}
          </button>
        </form>
        <p className="auth-footer">Acesso privado para candidatos autorizados.</p>
      </section>
    </main>
  )
}
