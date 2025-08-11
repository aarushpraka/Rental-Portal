import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const [tenant, setTenant] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTenant(data);
          setForm({
            phone: data.phone || '',
            aadhaar: data.aadhaar || '',
            preferredPayment: data.preferredPayment || '',
            upiId: data.upiId || '',
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      const user = auth.currentUser;
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, form);
      setMessage('✅ Profile updated successfully!');
      setEditMode(false);
    } catch (err) {
      console.error(err);
      setMessage('❌ Failed to update profile.');
    }
  };

  const handleLogout = () => {
    auth.signOut();
    navigate('/login');
  };

  const handlePasswordReset = () => {
    auth.sendPasswordResetEmail(auth.currentUser.email);
    setMessage('📧 Password reset email sent.');
  };

  if (loading) return <div className="loader">Loading profile...</div>;
  if (!tenant) return <div className="error-box">Profile not found.</div>;

  return (
    <div className="profile-page">
      <h2>👤 My Profile</h2>

      {message && <div className="message-box">{message}</div>}

      <div className="section">
        <h3>📋 Personal Details</h3>
        <p><strong>Name:</strong> {tenant.name}</p>
        <p><strong>Email:</strong> {tenant.email}</p>
        <label>
          Phone:
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            disabled={!editMode}
          />
        </label>
        <label>
          Aadhaar / ID:
          <input
            name="aadhaar"
            value={form.aadhaar}
            onChange={handleChange}
            disabled={!editMode}
          />
        </label>
      </div>

      <div className="section">
        <h3>🏠 Flat & Rent Info</h3>
        <p><strong>Flat Number:</strong> {tenant.flatNumber}</p>
        <p><strong>Rent Amount:</strong> ₹{tenant.rentAmount}/month</p>
        <p><strong>Rent Status:</strong> {tenant.rentStatus}</p>
        <p><strong>Joined On:</strong> {tenant.joinedOn}</p>
      </div>

      <div className="section">
        <h3>💳 Payment Info</h3>
        <label>
          Preferred Method:
          <select
            name="preferredPayment"
            value={form.preferredPayment}
            onChange={handleChange}
            disabled={!editMode}
          >
            <option value="">Select</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cash">Cash</option>
          </select>
        </label>
        <label>
          UPI ID:
          <input
            name="upiId"
            value={form.upiId}
            onChange={handleChange}
            disabled={!editMode}
          />
        </label>
      </div>

      <div className="button-group">
        {editMode ? (
          <>
            <button onClick={handleSave}>💾 Save</button>
            <button onClick={() => setEditMode(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditMode(true)}>✏️ Edit Profile</button>
        )}
        <button onClick={handlePasswordReset}>🔐 Change Password</button>
        <button onClick={handleLogout}>🚪 Logout</button>
      </div>
    </div>
  );
};

export default Profile;
