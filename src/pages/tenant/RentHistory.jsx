import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './RentHistory.css';

const RentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const q = query(
          collection(db, 'payments'),
          where('uid', '==', user.uid),
          orderBy('timestamp', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPayments(data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch payment history.');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, []);

  const getTotalPaid = () =>
    payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="rent-history">
      <h2>🧾 Rent Payment History</h2>
      {loading ? (
        <div className="loader">Loading history...</div>
      ) : error ? (
        <div className="error-box">{error}</div>
      ) : payments.length === 0 ? (
        <p>No payment records found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Amount Paid (₹)</th>
                <th>Electricity (₹)</th>
                <th>Total (₹)</th>
                <th>Method</th>
                <th>Paid On</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.month}</td>
                  <td>{p.amount - (p.electricity || 0)}</td>
                  <td>{p.electricity || 0}</td>
                  <td>{p.amount}</td>
                  <td>{p.method}</td>
                  <td>{p.date}</td>
                  <td>
                    {p.proofURL ? (
                      <a href={p.proofURL} target="_blank" rel="noopener noreferrer">
                         View Receipt
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3"><strong>Total Paid</strong></td>
                <td colSpan="4"><strong>₹{getTotalPaid()}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default RentHistory;
