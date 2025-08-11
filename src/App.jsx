import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useAuthRole from './useAuthRole';
import ProtectedRoute from './components/ProtectedRoute';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const TenantDashboard = lazy(() => import('./pages/tenant/TenantDashboard'));
const RentPayment = lazy(() => import('./pages/tenant/RentPayment'));
const RentHistory = lazy(() => import('./pages/tenant/RentHistory'));
const Profile = lazy(() => import('./pages/tenant/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const NotAuthorized = lazy(() => import('./pages/NotAuthorized'));

function App() {
  const { user, role, loading } = useAuthRole();


  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://pay.google.com/gp/p/js/pay.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

 
  if (loading) {
    return <div className="loader">Initializing app...</div>;
  }

  return (
    <Router>
      <Suspense fallback={<div className="loader">Loading...</div>}>
        <Routes>
          {/* Role-based login redirect */}
          <Route
            path="/login"
            element={
              !user ? (
                <LoginPage />
              ) : role === 'tenant' ? (
                <Navigate to="/tenant" replace />
              ) : role === 'admin' ? (
                <Navigate to="/admin" replace />
              ) : (
                <Navigate to="/not-authorized" replace />
              )
            }
          />

          {/* Default route handling */}
          <Route
            path="/"
            element={
              role === 'tenant' ? (
                <Navigate to="/tenant" replace />
              ) : role === 'admin' ? (
                <Navigate to="/admin" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Tenant Routes */}
          <Route
            path="/tenant"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['tenant']}>
                <TenantDashboard tenantId={user?.uid} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant/pay"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['tenant']}>
                <RentPayment tenantId={user?.uid} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant/history"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['tenant']}>
                <RentHistory tenantId={user?.uid} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant/profile"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['tenant']}>
                <Profile tenantId={user?.uid} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant/notifications"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['tenant']}>
                <Notifications tenantId={user?.uid} />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['admin']}>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <ProtectedRoute user={user} role={role} allowedRoles={['admin']}>
                <Notifications />
              </ProtectedRoute>
            }
          />

          {/* Unauthorized */}
          <Route path="/not-authorized" element={<NotAuthorized />} />

          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
