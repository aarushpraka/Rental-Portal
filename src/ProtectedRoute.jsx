import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ user, role, allowedRoles = [], children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles.length > 0 && !allowedRoles.includes(role?.toLowerCase())) {
    return <Navigate to="/not-authorized" replace />;
  }
  return children;
};

export default ProtectedRoute;
