import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthSessionError,
  authorizedApiRequest,
  clearAuthState,
  login,
  loadAuthState,
  refreshAuth,
  saveAuthState,
} from './authSession'

const createJwt = (exp) => {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp })}.signature`
}

describe('authSession', () => {
  beforeEach(() => {
    clearAuthState()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('stores login tokens and user data', async () => {
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'a.b.c',
          refresh_token: 'r1',
          access_expires_at: '2099-01-01T00:00:00Z',
          refresh_expires_at: '2099-01-02T00:00:00Z',
          user: { id: 1, username: 'admin', roles: ['admin'] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const state = await login('http://localhost:8000', 'admin', 'secret')
    expect(state.user.username).toBe('admin')
    expect(loadAuthState().refreshToken).toBe('r1')
  })

  it('refreshes after a 401 and retries the request', async () => {
    saveAuthState({
      accessToken: createJwt(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: 'refresh-token',
      accessExpiresAt: '2099-01-01T00:00:00Z',
      refreshExpiresAt: '2099-01-01T00:00:00Z',
      user: { id: 1, username: 'admin', roles: ['admin'] },
    })

    fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'expired' }), { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'new.token.value',
            refresh_token: 'refresh-token-2',
            access_expires_at: '2099-01-01T00:00:00Z',
            refresh_expires_at: '2099-01-02T00:00:00Z',
            user: { id: 1, username: 'admin', roles: ['admin'] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      )

    const result = await authorizedApiRequest('http://localhost:8000', '/books', { method: 'GET' })
    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('raises auth error when refresh token is missing', async () => {
    await expect(refreshAuth('http://localhost:8000')).rejects.toBeInstanceOf(AuthSessionError)
  })
})
