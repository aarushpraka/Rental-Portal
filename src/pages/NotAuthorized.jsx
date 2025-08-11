import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import './NotAuthorized.css';

const NotAuthorized = () => {
  const navigate = useNavigate();

  const handleRedirect = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error.message);
    }
  };

  return (
    <div className="not-auth-container">
      <div className="not-auth-card">
        <h1>🚫 Access Denied</h1>
        <p>You do not have permission to view this page.</p>
        <button className="return-link" type="button" onClick={handleRedirect}>
          Logout & Go to Login
        </button>
      </div>
    </div>
  );
};

export default NotAuthorized;
