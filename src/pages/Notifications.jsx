import  { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  arrayUnion,
} from 'firebase/firestore';
import './Notifications.css';

const typeIcons = {
  rent: '🧾',
  bill: '⚡',
  receipt: '📄',
  notice: '📢',
  alert: '🚨',
};

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      const user = auth.currentUser;
      if (!user) return;

      setUid(user.uid);

      try {
        const q = query(
          collection(db, 'notifications'),
          where('to', 'in', ['all', user.uid]),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setNotifications(data);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const markAsRead = async (notificationId) => {
    const notifRef = doc(db, 'notifications', notificationId);
    await updateDoc(notifRef, {
      readBy: arrayUnion(uid),
    });
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, readBy: [...(n.readBy || []), uid] } : n
      )
    );
  };

  return (
    <div className="notifications-page">
      <h2>🔔 Notifications</h2>
      {loading ? (
        <div className="loader">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <p>No notifications found.</p>
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => {
            const isRead = n.readBy?.includes(uid);
            return (
              <li
                key={n.id}
                className={`notification-item ${isRead ? 'read' : 'unread'}`}
                onClick={() => !isRead && markAsRead(n.id)}
              >
                <span className="icon">{typeIcons[n.type] || '📩'}</span>
                <div className="content">
                  <p className="title">{n.title}</p>
                  <p className="message">{n.message}</p>
                  <span className="timestamp">
                    {new Date(n.timestamp).toLocaleString()}
                  </span>
                </div>
                {!isRead && <span className="badge">●</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Notifications;
