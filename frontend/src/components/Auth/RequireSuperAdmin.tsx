import { useAuth } from '../../context/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

interface ProtectedRouteProps {
  children: JSX.Element
}

export function RequireSuperAdmin({ children }: ProtectedRouteProps) {
  const { staff } = useAuth()
  const location = useLocation()

  if (!staff) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (staff.role !== 'super_admin') {
    return <Navigate to="/unauthorized" state={{ message: 'Insufficient permissions' }} replace />
  }

  return children
}