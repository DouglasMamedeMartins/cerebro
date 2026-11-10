export interface Candidate {
  id: string
  name: string
  email: string
}

interface LoginCredentials {
  email: string
  password: string
}

export class ApiError extends Error {
  readonly status?: number
  readonly kind: 'http' | 'network' | 'configuration' | 'response'

  constructor(
    message: string,
    status?: number,
    kind: 'http' | 'network' | 'configuration' | 'response' = 'http',
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) {
    throw new ApiError('VITE_API_BASE_URL não está configurada.', undefined, 'configuration')
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Não foi possível conectar à API.', undefined, 'network')
  }

  if (!response.ok) {
    throw new ApiError('A API recusou a solicitação.', response.status, 'http')
  }

  if (response.status === 204) return undefined as T

  try {
    return await response.json() as T
  } catch {
    throw new ApiError('A API retornou uma resposta inválida.', response.status, 'response')
  }
}

function parseCandidate(value: unknown): Candidate {
  if (
    typeof value !== 'object' || value === null ||
    !('id' in value) || typeof value.id !== 'string' ||
    !('name' in value) || typeof value.name !== 'string' ||
    !('email' in value) || typeof value.email !== 'string'
  ) {
    throw new ApiError('A API retornou os dados do candidato em formato inválido.', undefined, 'response')
  }

  return { id: value.id, name: value.name, email: value.email }
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<Candidate> {
    const result = await request<unknown>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    return parseCandidate(result)
  },

  async me(): Promise<Candidate> {
    return parseCandidate(await request<unknown>('/api/auth/me'))
  },

  logout(): Promise<void> {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },
}
