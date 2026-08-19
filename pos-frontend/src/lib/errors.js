import { AuthSessionError } from '../authSession'

export const isAuthError = (error) => error instanceof AuthSessionError || Boolean(error?.authExpired)