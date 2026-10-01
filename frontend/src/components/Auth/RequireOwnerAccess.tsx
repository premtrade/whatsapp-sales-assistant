import { useAuth } from '../../context/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

interface ProtectedRouteProps {
  children: JSX.Element
}

export function RequireOwnerAccess({ children }: ProtectedRouteProps) {
  const { staff } = useAuth()
  const location = useLocation()

  if (!staff) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isOwnerRole = staff.role === 'super_admin' || staff.role === 'admin'
  if (!isOwnerRole) {
    return <Navigate to="/unauthorized" state={{ message: 'Insufficient permissions' }} replace />
  }

  return children
}
