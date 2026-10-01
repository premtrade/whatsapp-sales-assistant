import { useAuth } from '../../context/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

interface ProtectedRouteProps {
  children: JSX.Element
}

export function RequireBusinessAdmin({ children }: ProtectedRouteProps) {
  const { staff } = useAuth()
  const location = useLocation()

  if (!staff) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Allow super_admin and admin roles to access business admin pages
  if (staff.role !== 'super_admin' && staff.role !== 'admin') {
    return <Navigate to="/unauthorized" state={{ message: 'Insufficient permissions' }} replace />
  }

  return children
}