import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import './AdminSettings.css';

const AdminSettings = () => {
  const [admin, setAdmin] = useState({});
  const [flats, setFlats] = useState([]);
  const [rentCycle, setRentCycle] = useState({
    dueDate: '5',
    autoReset: false,
    reminderDays: '2',
  });
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const adminRef = doc(db, 'admins', user.uid);
        const flatRef = collection(db, 'flats');
        const templateRef = collection(db, 'notificationTemplates');

        const [adminSnap, flatSnap, templateSnap] = await Promise.all([
          getDoc(adminRef),
          getDocs(flatRef),
          getDocs(templateRef),
        ]);

        if (adminSnap.exists()) setAdmin(adminSnap.data());
        setFlats(flatSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setTemplates(templateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Error fetching settings:', err);
        setMessage('❌ Failed to load settings.');
      }
    };

    fetchSettings();
  }, []);

  const handleAdminChange = (e) => {
    setAdmin({ ...admin, [e.target.name]: e.target.value });
  };

  const saveAdminProfile = async () => {
    try {
      const adminRef = doc(db, 'admins', auth.currentUser.uid);
      await updateDoc(adminRef, admin);
      setMessage('✅ Profile updated');
    } catch (err) {
      console.error(err);
      setMessage('❌ Failed to update profile.');
    }
  };

  const updateRentCycle = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'rentCycle');
      await setDoc(settingsRef, rentCycle);
      setMessage('✅ Rent cycle updated');
    } catch (err) {
      setMessage('❌ Rent cycle update failed.');
    }
  };

  const clearRentStatus = async () => {
    try {
      const tenantRef = collection(db, 'users');
      const tenants = await getDocs(tenantRef);

      const updates = tenants.docs.map(async (t) => {
        const data = t.data();
        if (data.role === 'tenant') {
          await updateDoc(doc(db, 'users', t.id), { rentStatus: 'Unpaid' });
        }
      });

      await Promise.all(updates);
      setMessage('⚠️ Rent statuses reset for all tenants');
    } catch (err) {
      console.error(err);
      setMessage('❌ Failed to reset rent statuses');
    }
  };

  return (
    <div className="admin-settings">
      <h2>⚙️ Admin Settings</h2>
      {message && <div className="message-box">{message}</div>}

      {/* Admin Profile */}
      <section>
        <h3>🧑‍💼 Admin Profile</h3>
        <label>Name: <input name="name" value={admin.name || ''} onChange={handleAdminChange} /></label>
        <label>Email: <input value={admin.email || ''} disabled /></label>
        <label>Phone: <input name="phone" value={admin.phone || ''} onChange={handleAdminChange} /></label>
        <label>UPI ID: <input name="upi" value={admin.upi || ''} onChange={handleAdminChange} /></label>
        <button onClick={saveAdminProfile}>💾 Save Profile</button>
        <button onClick={() => auth.sendPasswordResetEmail(admin.email)}>🔐 Reset Password</button>
      </section>

      {/* Flat Settings */}
      <section>
        <h3>🏘️ Flat Settings</h3>
        <table>
          <thead>
            <tr><th>Flat</th><th>Rent</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {flats.map(f => (
              <tr key={f.id}>
                <td>{f.flatNumber}</td>
                <td>₹{f.rent}</td>
                <td>{f.status}</td>
                <td>
                  <button>Edit</button>
                  <button onClick={() => deleteDoc(doc(db, 'flats', f.id))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button>➕ Add Flat</button>
      </section>

      {/* Rent Cycle Settings */}
      <section>
        <h3>📅 Rent Cycle Settings</h3>
        <label>Due Date:
          <input type="number" value={rentCycle.dueDate} onChange={(e) => setRentCycle({ ...rentCycle, dueDate: e.target.value })} />
        </label>
        <label>Auto Reset:
          <input type="checkbox" checked={rentCycle.autoReset} onChange={(e) => setRentCycle({ ...rentCycle, autoReset: e.target.checked })} />
        </label>
        <label>Reminder Days Before:
          <input type="number" value={rentCycle.reminderDays} onChange={(e) => setRentCycle({ ...rentCycle, reminderDays: e.target.value })} />
        </label>
        <button onClick={updateRentCycle}>💾 Update Rent Cycle</button>
      </section>

      {/* Notification Templates */}
      <section>
        <h3>📨 Notification Templates</h3>
        <ul>
          {templates.map(t => (
            <li key={t.id}>
              <strong>{t.name}</strong>: {t.message}
              <button>Edit</button>
              <button onClick={() => deleteDoc(doc(db, 'notificationTemplates', t.id))}>Delete</button>
            </li>
          ))}
        </ul>
        <button>➕ Add Template</button>
      </section>

      {/* Danger Zone */}
      <section className="danger-zone">
        <h3>❗ Danger Zone</h3>
        <button onClick={clearRentStatus}>❌ Reset All Rent Statuses</button>
        <button>❌ Delete Tenant</button>
        <button>❌ Reset All Flat Data</button>
      </section>
    </div>
  );
};

export default AdminSettings;
