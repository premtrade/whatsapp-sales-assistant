import { useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { authService } from '@/services/auth'
import { login as loginRequest } from '@/services/api'
import { createContext, useContext } from 'react'
import type { StaffUser, AuthState } from '@/types/auth'
import toast from 'react-hot-toast'

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffUser | null>(authService().getStaff())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifyAuth() {
      const token = authService().getToken()
      if (!token) {
        setLoading(false)
        return
      }

      try {
        setStaff(authService().getStaff())
      } catch {
        authService().clearAuth()
        setStaff(null)
      } finally {
        setLoading(false)
      }
    }

    verifyAuth()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await loginRequest({ email, password })
      authService().setAuth(data.token, data.staff)
      setStaff(data.staff)
      toast.success('Login successful')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed')
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    authService().clearAuth()
    setStaff(null)
    toast.success('Logged out successfully')
  }, [])

  const value: AuthContextType = {
    staff,
    token: authService().getToken(),
    isAuthenticated: !!staff && !!authService().getToken(),
    login,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
