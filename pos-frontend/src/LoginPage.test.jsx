import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

describe('LoginPage', () => {
  it('submits entered credentials', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<LoginPage onLogin={onLogin} loading={false} error="" />)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(onLogin).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
  })

  it('renders backend error state', () => {
    render(<LoginPage onLogin={() => {}} loading={false} error="Invalid username or password" />)
    expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument()
  })
})
