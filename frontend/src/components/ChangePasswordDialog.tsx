import { useState, type FormEvent } from 'react'
import { ApiError, authApi } from '../services/api'

interface ChangePasswordDialogProps {
  onClose: () => void
}

export function ChangePasswordDialog({ onClose }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [changed, setChanged] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmation) {
      setError('As novas senhas não coincidem.')
      return
    }
    if (newPassword.length < 12) {
      setError('A nova senha precisa ter pelo menos 12 caracteres.')
      return
    }

    setPending(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setChanged(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'CURRENT_PASSWORD_INVALID') {
        setError('A senha atual está incorreta.')
      } else if (cause instanceof ApiError && cause.code === 'INVALID_PASSWORD') {
        setError('A senha não atende à política de segurança.')
      } else if (cause instanceof ApiError && cause.code === 'PASSWORD_CHANGED_CONCURRENTLY') {
        setError('A senha foi alterada em outra sessão. Entre novamente e tente de novo.')
      } else {
        setError('Não foi possível alterar a senha. Tente novamente.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="password-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose()
    }}>
      <section className="auth-card password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <button className="password-dialog-close" type="button" onClick={onClose} disabled={pending} aria-label="Fechar alteração de senha">×</button>
        {changed ? (
          <>
            <div className="auth-eyebrow">SEGURANÇA DA CONTA</div>
            <h1 id="change-password-title">Senha alterada</h1>
            <p className="auth-description">Sua nova senha já está ativa. As outras sessões da conta foram encerradas.</p>
            <button className="auth-submit password-dialog-submit" type="button" onClick={onClose}>Concluir</button>
          </>
        ) : (
          <>
            <div className="auth-eyebrow">SEGURANÇA DA CONTA</div>
            <h1 id="change-password-title">Alterar senha</h1>
            <p className="auth-description">Confirme sua senha atual e escolha uma nova com pelo menos 12 caracteres.</p>
            <form className="auth-form" onSubmit={(event) => void submit(event)}>
              <label htmlFor="current-password">Senha atual</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                maxLength={4096}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                disabled={pending}
              />
              <label htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={4096}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                disabled={pending}
              />
              <label htmlFor="new-password-confirmation">Confirme a nova senha</label>
              <input
                id="new-password-confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={4096}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                disabled={pending}
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit password-dialog-submit" type="submit" disabled={pending}>
                {pending ? 'Alterando…' : 'Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
