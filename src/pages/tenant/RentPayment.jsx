import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import './RentPayment.css';

const RentPayment = () => {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [proof, setProof] = useState('');
  const [preview, setPreview] = useState('');
  const [paid, setPaid] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTenant = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTenant(data);
          setPaid(data.rentStatus === 'Paid');
        }
      } catch (err) {
        setError('Failed to load tenant data.');
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
        setProof(reader.result); // base64 string
      };
      reader.readAsDataURL(selected);
    } else {
      setError('Please select a valid image file.');
    }
  };

  const handlePayment = async () => {
    if (!tenant) return;
    setError('');
    setLoading(true);

    try {
      const total = tenant.rentAmount + (tenant.electricityBill?.amount || 0);
      const paymentId = `TXN${Date.now()}`;
      const uid = auth.currentUser.uid;

      await setDoc(doc(db, 'payments', paymentId), {
        uid,
        name: tenant.name,
        flat: tenant.flatNumber,
        amount: total,
        method: paymentMethod,
        month: 'July 2025',
        proofBase64: proof || '', // Store base64 image directly
        date: new Date().toLocaleDateString(),
        timestamp: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', uid), {
        rentStatus: 'Paid',
      });

      setReceipt({
        id: paymentId,
        amount: total,
        date: new Date().toLocaleDateString(),
        proofBase64: proof,
      });

      setPaid(true);
    } catch (err) {
      console.error(err);
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loader">Loading payment info...</div>;
  if (!tenant) return <div className="error-box">Tenant data not found.</div>;

  const { name, flatNumber, rentAmount, electricityBill, rentDueDate } = tenant;
  const totalDue = rentAmount + (electricityBill?.amount || 0);

  return (
    <div className="rent-payment">
      <h2>💳 Rent Payment</h2>
      <p className="subtitle">Pay your monthly rent and utility charges</p>

      <div className="tenant-info">
        <p>👤 <strong>Name:</strong> {name}</p>
        <p>🏠 <strong>Flat:</strong> {flatNumber}</p>
        <p>📅 <strong>Month:</strong> July 2025</p>
      </div>

      <div className="payment-breakdown">
        <h3>📋 Payment Breakdown</h3>
        <ul>
          <li>Rent: ₹{rentAmount}</li>
          <li>Electricity: ₹{electricityBill?.amount || 0}</li>
          <li>Other Charges: ₹0</li>
        </ul>
        <hr />
        <p className={`total-due ${paid ? 'paid' : 'due'}`}>
          🔢 Total Due: ₹{totalDue}
        </p>
        <p><strong>Due Date:</strong> {rentDueDate}</p>
      </div>

      {paid ? (
        <div className="paid-box">✅ You've already paid for July.</div>
      ) : (
        <>
          <div className="payment-method">
            <h4>💳 Select Payment Method</h4>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
            </select>
            {paymentMethod === 'UPI' && (
              <p className="upi-info">Send to UPI ID: <strong>myflats@upi</strong></p>
            )}
          </div>

          <div className="upload-proof">
            <h4>📤 Upload Payment Proof (Optional)</h4>
            <input type="file" accept="image/*" onChange={handleFileChange} />
            {preview && <img src={preview} alt="Preview" width="200" />}
          </div>

          <button
            className="pay-btn"
            onClick={handlePayment}
            disabled={loading}
          >
            {loading ? 'Processing...' : `Pay ₹${totalDue} Now`}
          </button>
        </>
      )}

      {receipt && (
        <div className="receipt-box">
          <h4>📄 Payment Receipt</h4>
          <p><strong>Receipt ID:</strong> {receipt.id}</p>
          <p><strong>Amount:</strong> ₹{receipt.amount}</p>
          <p><strong>Date:</strong> {receipt.date}</p>
          {receipt.proofBase64 && (
            <>
              <p><strong>Proof of Payment:</strong></p>
              <img src={receipt.proofBase64} alt="Proof of Payment" width="200" />
            </>
          )}
          <button onClick={() => window.location.href = '/history'}>
            View Payment History
          </button>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
    </div>
  );
};

export default RentPayment;
