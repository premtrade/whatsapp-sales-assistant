export function authService() {
  const tokenKey = 'auth_token'
  const staffKey = 'staff_user'

  function getToken(): string | null {
    return localStorage.getItem(tokenKey)
  }

  function getStaff(): any | null {
    const stored = localStorage.getItem(staffKey)
    if (!stored) return null
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  }

  function setAuth(token: string, staff: any): void {
    localStorage.setItem(tokenKey, token)
    localStorage.setItem(staffKey, JSON.stringify(staff))
  }

  function clearAuth(): void {
    localStorage.removeItem(tokenKey)
    localStorage.removeItem(staffKey)
  }

  function isAuthenticated(): boolean {
    return !!getToken()
  }

  return {
    getToken,
    getStaff,
    setAuth,
    clearAuth,
    isAuthenticated,
  }
}
