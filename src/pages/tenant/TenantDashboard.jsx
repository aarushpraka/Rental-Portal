
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FaHome, FaReceipt, FaMoneyBillWave, FaBolt,
  FaChartPie, FaCog, FaBars, FaTimes, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';
import { getAuth, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { fetchBills } from './fetchBills';
import './TenantDashboard.css';
import { loadStripe } from '@stripe/stripe-js';

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = 'info', ttl = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl);
  }, []);
  return { toasts, show };
}
function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

function useWindowSize() {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  });
  useEffect(() => {
    let t;
    const handle = () => {
      clearTimeout(t);
      t = setTimeout(() => setSize({ width: window.innerWidth, height: window.innerHeight }), 150);
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return size;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
function formatINR(n) { return inr.format(Number(n || 0)); }

/* ===========================
   Layout components
   =========================== */

function Sidebar({ activePanel, onSelect }) {
  const items = [
    { id: null, icon: <FaHome />, label: 'Dashboard' },
    { id: 'payments', icon: <FaReceipt />, label: 'Payments' },
    { id: 'houseRent', icon: <FaMoneyBillWave />, label: 'House Rent' },
    { id: 'electricity', icon: <FaBolt />, label: 'Electricity' },
    { id: 'analytics', icon: <FaChartPie />, label: 'Analytics' },
    { id: 'settings', icon: <FaCog />, label: 'Settings' },
  ];
  return (
    <aside className="sidebar" role="navigation" aria-label="Quick actions">
      <h3>Quick Actions</h3>
      <ul className="quick-action-list">
        {items.map(({ id, icon, label }) => (
          <li
            key={label}
            className={activePanel === id ? 'active' : ''}
            onClick={() => onSelect(id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(id)}
            aria-current={activePanel === id ? 'page' : undefined}
          >
            {icon} {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Header({ onLogout, onToggleSidebar, sidebarOpen }) {
  const confirmLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) onLogout();
  };
  return (
    <div className="header-actions">
      <button
        className="sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        title={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? <FaTimes /> : <FaBars />}
      </button>
      <button className="logout-icon" onClick={confirmLogout} title="Logout" aria-label="Logout">
        <FiLogOut />
      </button>
    </div>
  );
}


function PaymentModal({ bill, processing, statusMessage, onClose, handlePayment }) {
  const modalRef = useRef(null);
  const firstFocusable = useRef(null);
  const lastFocusable = useRef(null);


  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;

    const focusables = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) {
      firstFocusable.current = focusables[0];
      lastFocusable.current = focusables[focusables.length - 1];
      firstFocusable.current.focus();
    }

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const isShift = e.shiftKey;
      if (document.activeElement === firstFocusable.current && isShift) {
        e.preventDefault();
        lastFocusable.current.focus();
      } else if (document.activeElement === lastFocusable.current && !isShift) {
        e.preventDefault();
        firstFocusable.current.focus();
      }
    };

    const esc = (e) => {
      if (e.key === 'Escape' && !processing) onClose();
    };

    document.addEventListener('keydown', trap);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('keydown', trap);
      document.removeEventListener('keydown', esc);
    };
  }, [processing, onClose]);

  const handleGooglePay = async () => {
    if (processing) return;
    await handlePayment(bill);
    onClose();
  };

  return (
    <>
      <div className="modal-overlay" onClick={() => !processing && onClose()} aria-hidden="true" />
      <div className="payment-modal fade-in-down" role="dialog" aria-modal="true" ref={modalRef}>
        <div className="modal-header">
          <h3>Pay ₹{bill.amount}</h3>
          <button onClick={onClose} disabled={processing} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          <p><strong>Due:</strong> {bill.billFor}</p>
          <p>Pay securely using Google Pay.</p>
          {statusMessage && <p className="status-msg">{statusMessage}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={processing}>
            Cancel
          </button>
          <button
            className={`btn-confirm ${processing ? 'btn-loading' : ''}`}
            onClick={handleGooglePay}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Pay with Google Pay'}
          </button>
        </div>
      </div>
    </>
  );
}



const SuccessDialog = ({ meta, onClose }) => {
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="success-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="success-modal" onClick={(e) => e.stopPropagation()}>
        <div className="success-icon-wrap">
          <svg className="success-ring" viewBox="0 0 120 120">
            <circle className="ring-bg" cx="60" cy="60" r="54" />
            <circle className="ring-fg" cx="60" cy="60" r="54" />
            <path
              className="check"
              d="M40 64 L55 78 L82 48"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h3 className="success-title">Payment successful</h3>
        {meta && (
          <p className="success-subtitle">
            {meta.type} • {meta.month} {meta.year}
            <br />
            <strong>{formatINR(meta.amount || 0)}</strong>
          </p>
        )}

        <button className="btn btn-primary success-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

/* ===========================
   Panels
   =========================== */

function OverviewPanel({ bills }) {
  const rentDue = useMemo(
    () => bills
      .filter(b => b.type === 'rent' && b.status !== 'Paid')
      .reduce((s, b) => s + b.amount, 0),
    [bills]
  );

  const elecDue = useMemo(
    () => bills
      .filter(b => b.type === 'electricity' && b.status !== 'Paid')
      .reduce((s, b) => s + b.amount, 0),
    [bills]
  );

  const upcoming = useMemo(
    () =>
      bills
        .filter(b => b.status !== 'Paid')
        .sort((a, b) => new Date(a.billFor) - new Date(b.billFor))[0],
    [bills]
  );

  return (
    <div className="feature-panel fade-in">
      <h2>Dashboard Overview</h2>
      <div className="summary-cards">
        <div className="card"><h4>Rent Due</h4><p>{formatINR(rentDue)}</p></div>
        <div className="card"><h4>Electricity Due</h4><p>{formatINR(elecDue)}</p></div>
        <div className="card"><h4>Upcoming Bill</h4><p>{upcoming?.billFor || 'None'}</p></div>
      </div>
    </div>
  );
}

function PaymentsPanel({ bills /*, openModal (hidden here) */ }) {
  const [status, setStatus] = useState('all');
  const sorted = useMemo(
    () => [...bills].sort((a, b) => new Date(b.billFor) - new Date(a.billFor)),
    [bills]
  );
  const filtered = useMemo(
    () =>
      sorted.filter(b =>
        status === 'all' ? true : status === 'paid' ? b.status === 'Paid' : b.status !== 'Paid'
      ),
    [sorted, status]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filtered.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  return (
    <div className="feature-panel fade-in">
      <div className="panel-head">
        <h2>All Bills</h2>
        <select value={status} onChange={e => {
          setStatus(e.target.value);
          setCurrentPage(1);
        }}>
          <option value="all">All</option>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {filtered.length ? (
        <>
          <div className="table-container">
            <table className="feature-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map(b => (
                  <tr key={b.id}>
                    <td>{b.month} {b.year}</td>
                    <td>{b.type}</td>
                    <td>{formatINR(b.amount)}</td>
                    <td>{b.billFor}</td>
                    <td className={b.status === 'Paid' ? 'paid' : 'due'}>
                      <span className={`badge ${b.status === 'Paid' ? 'paid' : 'due'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td><span style={{ opacity: 0.6 }}>—</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M12.293 16.293a1 1 0 010-1.414L16.586 10 12.293 5.707a1 1 0 011.414-1.414L18.414 10l-4.707 4.707a1 1 0 01-1.414 0z" transform="rotate(180 10 10)" />
              </svg>
            </button>

            <span>{currentPage} / {totalPages}</span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M12.293 16.293a1 1 0 010-1.414L16.586 10 12.293 5.707a1 1 0 011.414-1.414L18.414 10l-4.707 4.707a1 1 0 01-1.414 0z" />
              </svg>
            </button>

          </div>
        </>
      ) : (
        <p className="no-bills">No bills found</p>
      )}
    </div>
  );
}

function CategoryPanel({ bills = [], type = 'rent', openModal }) {
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const MONTH_INDEX = useMemo(() => {
    const map = {};
    MONTHS.forEach((m, i) => {
      map[m.toLowerCase()] = i;
      map[m.slice(0, 3).toLowerCase()] = i;
    });
    return map;
  }, []);

  const toMonthIndex = (m) => {
    if (!m) return -1;
    const key = String(m).toLowerCase().trim();
    return MONTH_INDEX[key] ?? -1;
  };

  const resetFilters = () => {
    setMonthFilter('');
    setYearFilter('');
    setPage(1);
  };


  const sortedBills = useMemo(() => {
    return bills
      .filter(b =>
        b.type === type &&
        (!monthFilter || String(b.month).trim() === monthFilter) &&
        (!yearFilter || String(b.year) === String(yearFilter)) &&
        b.status !== 'Paid'
      )
      .sort((a, b) => {
        const yearA = Number(a.year) || 0;
        const yearB = Number(b.year) || 0;
        if (yearA !== yearB) return yearA - yearB;

        const monthA = toMonthIndex(a.month);
        const monthB = toMonthIndex(b.month);
        return monthA - monthB;
      });
  }, [bills, type, monthFilter, yearFilter, MONTH_INDEX]);


  const totalPages = Math.max(1, Math.ceil(sortedBills.length / pageSize));


  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const currentPage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedBills.slice(start, start + pageSize);
  }, [sortedBills, currentPage]);

  const formatINR = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  return (
    <div className="bill-list-container">
      <h2 className="form-heading">
        {type === 'rent' ? 'House Rent Bills' : 'Electricity Bills'}
      </h2>

      <div className="filters-row">
        <select
          className="select"
          value={monthFilter}
          onChange={e => {
            setMonthFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Months</option>
          {MONTHS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          className="select"
          value={yearFilter}
          onChange={e => {
            setYearFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Years</option>
          {[2023, 2024, 2025].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button className="btn" onClick={resetFilters}>Reset</button>
      </div>

      {paged.length > 0 ? (
        <>
          <div className="tenant-table bill-table">
            <div className="table-wrapper">
              <table className="table">
                <thead className="thead">
                  <tr>
                    <th>Month</th>
                    <th className="ta-right">Amount</th>

                    {type === 'electricity' && <th className="ta-right">Last Unit</th>}
                    {type === 'electricity' && <th className="ta-right">Current Unit</th>}
                    {type === 'electricity' && <th className="ta-right">Rate/Unit</th>}

                    <th>Due For</th>
                    <th>Note</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody className="tbody">
                  {paged.map(b => (
                    <tr key={b.id}>
                      <td>{b.month} {b.year}</td>
                      <td className="ta-right">{formatINR(b.amount)}</td>

                      {type === 'electricity' && (
                        <>
                          <td className="ta-right">
                            {Number.isFinite(Number(b.lastUnit)) ? Number(b.lastUnit) : '-'}
                          </td>
                          <td className="ta-right">
                            {Number.isFinite(Number(b.currentUnit)) ? Number(b.currentUnit) : '-'}
                          </td>
                          <td className="ta-right">
                            {Number.isFinite(Number(b.ratePerUnit)) ? `₹${Number(b.ratePerUnit)}` : '-'}
                          </td>
                        </>
                      )}

                      <td>{b.billFor || '-'}</td>
                      <td>{b.note || '-'}</td>
                      <td className={b.status === 'Paid' ? 'paid' : 'due'}>{b.status}</td>
                      <td>
                        <button
                          className="btn btn-small btn-primary"
                          onClick={() => openModal(b)}
                        >
                          Pay Now
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pagination">
            <button
              className="btn btn-icon"
              disabled={currentPage <= 1}
              style={{ width: 65 }}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <FaChevronLeft style={{ color: '#fff' }} />
            </button>
            <span className="page-indicator">{currentPage}/{totalPages}</span>
            <button
              className="btn btn-icon"
              style={{ width: 65 }}
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <FaChevronRight />
            </button>
          </div>
        </>
      ) : (
        <div className="no-bills">No pending bills found.</div>
      )}
    </div>
  );
}
function AnalyticsPanel({ bills }) {
  const totals = useMemo(() => {
    const t = bills.reduce(
      (acc, b) => {
        acc.total += b.amount;
        if (b.status === 'Paid') {
          acc.paid += b.amount;
          acc.countPaid += 1;
        } else {
          acc.due += b.amount;
          acc.countDue += 1;
        }
        if (b.type === 'rent') acc.rent += b.amount;
        if (b.type === 'electricity') acc.electricity += b.amount;
        return acc;
      },
      { total: 0, paid: 0, due: 0, rent: 0, electricity: 0, countPaid: 0, countDue: 0 }
    );
    return t;
  }, [bills]);

  return (
    <div className="feature-panel fade-in">
      <h2>Analytics</h2>
      <div className="summary-cards">
        <div className="card"><h4>Total</h4><p>{formatINR(totals.total)}</p></div>
        <div className="card"><h4>Paid</h4><p>{formatINR(totals.paid)} • {totals.countPaid} bills</p></div>
        <div className="card"><h4>Due</h4><p>{formatINR(totals.due)} • {totals.countDue} bills</p></div>
        <div className="card"><h4>Rent</h4><p>{formatINR(totals.rent)}</p></div>
        <div className="card"><h4>Electricity</h4><p>{formatINR(totals.electricity)}</p></div>
      </div>
    </div>
  );
}

function SettingsPanel({ userData, onSaved, onError }) {
  const [form, setForm] = useState({
    name: userData?.name || '',
    email: userData?.email || '',
    contact: userData?.contact || ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: userData?.name || '',
      email: userData?.email || '',
      contact: userData?.contact || ''
    });
  }, [userData]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const contactRegex = /^[0-9]{10}$/;
    if (!form.name.trim() || !emailRegex.test(form.email) || !contactRegex.test(form.contact)) {
      onError?.('Please enter a valid name, email, and 10-digit phone number.');
      return;
    }
    if (!userData?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userData.uid), {
        name: form.name.trim(),
        email: form.email.trim(),
        contact: form.contact.trim()
      });
      onSaved?.('Changes saved');
    } catch {
      onError?.('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="feature-panel fade-in">
      <h2>Settings</h2>
      <form className="settings-form" onSubmit={handleSubmit}>
        <label>Name: <input name="name" type="text" value={form.name} onChange={handleChange} required /></label>
        <label>Email: <input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
        <label>Phone: <input name="contact" type="tel" value={form.contact} onChange={handleChange} required /></label>
        <button type="submit" disabled={saving} aria-busy={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
    </div>
  );
}

/* ===========================
   Main page
   =========================== */

export default function TenantDashboard({ tenantId }) {
  const [activePanel, setActivePanel] = useState(null);
  const [bills, setBills] = useState([]);
  const [userData, setUserData] = useState(null);
  const [modalBill, setModalBill] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { width } = useWindowSize();
  const navigate = useNavigate();
  const { toasts, show } = useToasts();

  useEffect(() => {
    setSidebarOpen(width >= 768 ? true : false);
  }, [width]);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        navigate('/login');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setUserData({ uid: user.uid, ...snap.data() });
      } catch {
        setError('Failed to fetch user data.');
      }
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    fetchBills(tenantId)
      .then(data => { setBills(data || []); setError(''); })
      .catch(() => setError('Failed to load bills.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleLogout = () => signOut(getAuth()).then(() => navigate('/login'));

  const openModal = useCallback(bill => {
    setModalBill(bill);
    setStatusMessage('');
  }, []);

  const closeModal = useCallback(() => {
    if (!processing) setModalBill(null);
  }, [processing]);

  const loadRazorpayScript = () => new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  // Real Razorpay flow (keep for production)
  // const handlePayment = useCallback(async () => {
  //   if (!modalBill || !userData) return;
  //   setProcessing(true);
  //   setStatusMessage('Initializing payment...');
  //   const loaded = await loadRazorpayScript();
  //   if (!loaded || !process.env.REACT_APP_RAZORPAY_KEY_ID) {
  //     setStatusMessage('Payment setup error.');
  //     setProcessing(false);
  //     return;
  //   }
  //   const opts = {
  //     key: process.env.REACT_APP_RAZORPAY_KEY_ID,
  //     amount: modalBill.amount * 100,
  //     currency: 'INR',
  //     name: 'Tenant Rent Payment',
  //     description: `${modalBill.type} due ${modalBill.billFor}`,
  //     handler: async res => {
  //       setStatusMessage('Verifying payment...');
  //       const ref = doc(db, 'users', modalBill.tenantId, 'bills', modalBill.id);
  //       try {
  //         await updateDoc(ref, { status: 'Paid', paymentId: res.razorpay_payment_id, paidAt: new Date() });
  //         const updated = await fetchBills(tenantId);
  //         setBills(updated || []);
  //         setStatusMessage('Payment successful');
  //         setTimeout(() => closeModal(), 1000);
  //       } catch {
  //         setStatusMessage('Error updating payment status.');
  //       } finally {
  //         setProcessing(false);
  //       }
  //     },
  //     prefill: { name: userData.name || '', email: userData.email || '', contact: userData.contact || '' },
  //     theme: { color: '#528FF0' }
  //   };
  //   try {
  //     new window.Razorpay(opts).open();
  //   } catch {
  //     setStatusMessage('Payment failed.');
  //     setProcessing(false);
  //   }
  // }, [modalBill, userData, tenantId, closeModal]);

  // Mock payment for testing (writes to Firestore and refreshes list)
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMeta, setSuccessMeta] = useState(null);

  const stripePromise = loadStripe('pk_test_51RuUuRQOfJEfe6eIyzIDFr7OqoJ3WNfdK02Up87IqJ17XICpsdkMFRuXeE5i8vHeoxSdqiSloEbMSE5LgPmQZzQa00J9tlsFmi');

  function loadGooglePayScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.payments?.api?.PaymentsClient) {
        resolve(window.google.payments.api.PaymentsClient);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://pay.google.com/gp/p/js/pay.js';
      script.onload = () => resolve(window.google.payments.api.PaymentsClient);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  const handlePayment = useCallback(async (bill) => {
    if (!bill) return;

    const tenantUid = bill.tenantId || userData?.uid;
    if (!tenantUid) {
      setStatusMessage('Missing tenant ID');
      return;
    }

    try {
      const PaymentsClientConstructor = await loadGooglePayScript();

      const paymentsClient = new PaymentsClientConstructor({
       environment: 'TEST',

      });

      const paymentDataRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['MASTERCARD', 'VISA'],
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
             gateway: 'example',
            
            },
          },
        }],
        merchantInfo: {
          merchantName: 'RentEase',
        
        },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: bill.amount.toFixed(2),
          currencyCode: 'INR',
          countryCode: 'IN',
        },
      };


      const paymentData = await paymentsClient.loadPaymentData(paymentDataRequest);
      console.log('Google Pay response:', paymentData);

      const token = paymentData.paymentMethodData.tokenizationData.token;
      console.log('Token received from Google Pay:', token);

      // Simulate sending token to backend
      await fetch('/your-backend-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, amount: bill.amount }),
      });

      const ref = doc(db, 'users', tenantUid, 'bill', bill.id);
      await setDoc(ref, { status: 'Paid', paidAt: new Date() }, { merge: true });

      const updated = await fetchBills(tenantId);
      setBills(updated || []);
      setShowSuccess(true);
      show('Payment recorded via Google Pay (Razorpay)', 'success');
    } catch (err) {
      console.error('Payment failed:', err);

      const errorMessage = err?.message || 'Payment cancelled or failed';


      show(errorMessage, {
        type: 'error',
        autoClose: false,
        closeOnClick: true,
        draggable: true,
      });

    }

  }, [userData, tenantId, show, setBills, setShowSuccess, setStatusMessage]);





  const panelMap = useMemo(() => ({
    null: <OverviewPanel bills={bills} />,
    payments: <PaymentsPanel bills={bills} /* openModal={openModal} */ />,
    houseRent: <CategoryPanel bills={bills} type="rent" openModal={openModal} />,
    electricity: <CategoryPanel bills={bills} type="electricity" openModal={openModal} />,
    analytics: <AnalyticsPanel bills={bills} />,
    settings: <SettingsPanel
      userData={userData}
      onSaved={(msg) => show(msg, 'success')}
      onError={(msg) => show(msg, 'error')}
    />
  }), [bills, openModal, userData, show]);

  return (
    <div className={`tenant-dashboard ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="top-right-actions">
        <button className="logout-btn" onClick={handleLogout} title="Logout" aria-label="Logout">
          <FiLogOut style={{ marginRight: '6px' }} />

        </button>
      </div>

      <Sidebar
        activePanel={activePanel}
        onSelect={id => {
          setActivePanel(id);
          if (width < 768) setSidebarOpen(false);
        }}
      />
      <main className="dashboard-body">
        {loading
          ? <div className="loading">Loading…</div>
          : error
            ? <div className="error-msg">{error}</div>
            : panelMap[activePanel]}
      </main>
      <nav className="mobile-nav">
        <button onClick={() => setActivePanel(null)} title="Dashboard" aria-label="Dashboard"><FaHome /></button>
        <button onClick={() => setActivePanel('payments')} title="Payments" aria-label="Payments"><FaReceipt /></button>
        <button onClick={() => setActivePanel('houseRent')} title="Rent" aria-label="Rent"><FaMoneyBillWave /></button>
        <button onClick={() => setActivePanel('electricity')} title="Electricity" aria-label="Electricity"><FaBolt /></button>
        <button onClick={() => setActivePanel('settings')} title="Settings" aria-label="Settings"><FaCog /></button>
      </nav>

      {modalBill && (
        <PaymentModal
          bill={modalBill}
          processing={processing}
          statusMessage={statusMessage}
          onClose={closeModal}
          handlePayment={handlePayment}
        />

      )}

      {showSuccess && (
        <SuccessDialog meta={successMeta} onClose={() => setShowSuccess(false)} />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
