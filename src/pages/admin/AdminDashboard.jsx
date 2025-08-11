import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import {
  collection, getDocs, query, where, orderBy, setDoc,
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp, limit
} from 'firebase/firestore';
import './AdminDashboard.css';
import {
  FaUser, FaMoneyBillWave, FaBolt, FaBuilding,
  FaExclamationTriangle, FaHome, FaBullhorn,
  FaCog, FaReceipt, FaPlus, FaCheck, FaDownload, FaLayerGroup, FaTrash, FaSearch, FaChevronLeft, FaChevronRight, FaCalendarAlt, FaMoneyBill, FaCalculator
} from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { firestore } from '../../firebase';
import { useAuthContext } from './AuthContext';



const iconStyle = { color: '#c3b1e1', marginRight: '8px', verticalAlign: 'middle' };
const TENANT_ROLE = 'tenant';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [String(CURRENT_YEAR - 1), String(CURRENT_YEAR), String(CURRENT_YEAR + 1), String(CURRENT_YEAR + 2)];


const SummaryCard = ({ label, value }) => (
  <div className="card summary-card">{label}: <strong>{value}</strong></div>
);


function BillingForm({ type, tenants, addedByEmail, onRefreshBills, currency, numberFmt }) {
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [currentUnit, setCurrentUnit] = useState('');
  const [rate, setRate] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastUnitDefault, setLastUnitDefault] = useState(0);
  const [lastUnit, setLastUnit] = useState('');

  // Clear success/error messages after 3 seconds
  useEffect(() => {
    if (ok || err) {
      const t = setTimeout(() => {
        setOk('');
        setErr('');
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [ok, err]);

  // Format amount safely
  const safeFormatAmt = (n) => {
    try {
      if (numberFmt?.format) return numberFmt.format(n);
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
    } catch {
      return String(n);
    }
  };

useEffect(() => {
  const loadLastUnit = async () => {
    if (type !== 'electricity' || !tenantId || !month || !year) {
      setLastUnitDefault(0);
      setLastUnit('');
      setStatusMessage('');
      return;
    }

    // Calculate previous month and year
    const monthIndex = MONTHS.indexOf(month);
    let prevMonthIndex = monthIndex - 1;
    let prevYear = parseInt(year);

    if (prevMonthIndex < 0) {
      prevMonthIndex = 11;
      prevYear -= 1;
    }

    const prevMonth = MONTHS[prevMonthIndex];
    const prevYearStr = String(prevYear);

    try {
      const billRef = collection(db, 'users', tenantId, 'bill');
      const q = query(
        billRef,
        where('type', '==', 'electricity'),
        where('month', '==', prevMonth),
        where('year', '==', prevYearStr),
        limit(1
      ),)

      const snap = await getDocs(q);
      if (!snap.empty) {
        const prev = snap.docs[0].data();
        const prevCurr = Number(prev.currentUnit ?? prev.meterCurrent ?? 0);
        if (Number.isFinite(prevCurr)) {
          setLastUnitDefault(prevCurr);
          setLastUnit(String(prevCurr));
          setStatusMessage(`Fetched last unit from ${prevMonth} ${prevYearStr}: ${prevCurr}`);
          return;
        }
      }

      setLastUnitDefault(0);
      setLastUnit('');
      setStatusMessage(`No previous bill found for ${prevMonth} ${prevYearStr}`);
    } catch (err) {
      console.error('Error fetching previous bill:', err);
      setLastUnitDefault(0);
      setLastUnit('');
      setStatusMessage('Error fetching previous bill');
    }
  };

  loadLastUnit();
}, [type, tenantId, month, year]);




  useEffect(() => {
    if (type !== 'electricity') return;
    const last = Number(lastUnit) || 0;
    const curr = Number(currentUnit) || 0;
    const r = Number(rate) || 0;
    const units = Math.max(0, curr - last);
    const amt = Math.max(0, units * r);
    setAmount(amt ? String(amt.toFixed(2)) : '');
  }, [type, lastUnit, currentUnit, rate]);

  const handleSubmit = async () => {
    setErr('');
    setOk('');

    if (!tenantId || !month || !year) {
      setErr('Please fill all fields.');
      return;
    }

    let amtNum = Number(amount);

    if (type === 'electricity') {
      const last = Number(lastUnit);
      const curr = Number(currentUnit);
      const r = Number(rate);

      if (!Number.isFinite(last) || !Number.isFinite(curr) || !Number.isFinite(r)) {
        setErr('Enter valid numbers for last unit, current unit, and rate.');
        return;
      }
      if (curr < last) {
        setErr('Current unit cannot be less than last unit.');
        return;
      }
      const units = curr - last;
      amtNum = +(units * r).toFixed(2);
      if (!Number.isFinite(amtNum) || amtNum < 0) {
        setErr('Calculated amount is invalid.');
        return;
      }
    } else {
      if (!amount) {
        setErr('Please enter amount.');
        return;
      }
      if (!Number.isFinite(amtNum)) {
        setErr('Amount must be a number.');
        return;
      }
    }

    setLoading(true);

    try {
      const billRef = collection(db, 'users', tenantId, 'bill');

      const dupQ = query(
        billRef,
        where('type', '==', type),
        where('month', '==', month),
        where('year', '==', year)
      );
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) {
        setErr('Duplicate bill for selected month/year.');
        setLoading(false);
        return;
      }

      const refId = `${type.toUpperCase()}-${month}-${year}-${tenantId}`;
      const monthIdx = MONTHS.indexOf(month) + 1;
      const billFor = `${year}-${String(monthIdx).padStart(2, '0')}-01`;

      const baseDoc = {
        addedBy: addedByEmail,
        amount: amtNum,
        billFor,
        createdAt: serverTimestamp(),
        month,
        note: note || '',
        refId,
        status: 'Pending',
        tenantId,
        type,
        updatedAt: serverTimestamp(),
        year
      };

      const extra =
        type === 'electricity'
          ? {
            lastUnit: Number(lastUnit) || 0,
            currentUnit: Number(currentUnit) || 0,
            unitsUsed: Math.max(0, (Number(currentUnit) || 0) - (Number(lastUnit) || 0)),
            ratePerUnit: Number(rate) || 0
          }
          : {};

      await addDoc(billRef, { ...baseDoc, ...extra });
    } catch (e) {
      setErr('Failed to add bill.');
      setLoading(false);
      return;
    }

    try {
      setOk(`Bill added (₹${Number(amtNum).toFixed(2)})`);
      setTenantId('');
      setAmount('');
      setMonth(MONTHS[new Date().getMonth()]);
      setYear(String(new Date().getFullYear()));
      setNote('');
      setCurrentUnit('');
      setRate('');
      setLastUnit(0);
      setStatusMessage('');

      if (onRefreshBills) await onRefreshBills();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tenant-form-container">
      <h2 className="form-heading">
        {type === 'rent' ? 'Set Rent Amount' : 'Set Electricity Amount'}
      </h2>

      <form onSubmit={(e) => e.preventDefault()} className="tenant-form">
        <div className="form-group">
          <select className="select" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select Tenant</option>
            {tenants.filter(t => t.active !== false).map(t => (
              <option key={t.id} value={t.id}>{t.name} (Flat {t.flatNumber})</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {type === 'rent' ? (
          <div className="form-group">
            <input
              className="input"
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="form-group">
              <input
                className="input"
                type="number"
                placeholder={`Last unit (auto from previous bill)`}
                value={lastUnit}
                onChange={(e) => setLastUnit(e.target.value)}
                title="Last recorded meter reading"
              />
              <input
                className="input"
                type="number"
                placeholder="Current unit"
                value={currentUnit}
                onChange={(e) => setCurrentUnit(e.target.value)}
              />
              <input
                className="input"
                type="number"
                placeholder="Rate per unit"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ gap: 8 }}>
              <div className="input" style={{ pointerEvents: 'none' }}>
                Units used: {Math.max(0, (Number(currentUnit) || 0) - (Number(lastUnit) || 0))}
              </div>
              <div className="input" style={{ pointerEvents: 'none' }}>
                Calculated amount: ₹{safeFormatAmt(amount || 0)}
              </div>
            </div>
          </>
        )}

        <div className="form-group">
          <input
            className="input"
            type="text"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {statusMessage && <p className="form-info">ℹ️ {statusMessage}</p>}
        {err && <p className="form-error">⚠️ {err}</p>}
        {ok && <p className="form-success">✅ {ok}</p>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? 'Saving...' : `Add ${type === 'rent' ? 'Rent' : 'Electricity'}`}
        </button>
      </form>
    </div>
  );
}



const AdminDashboard = () => {

  const [tenants, setTenants] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [newTenant, setNewTenant] = useState({
    name: '', flatNumber: '', rentAmount: '',
    joinedOn: new Date().toISOString().split('T')[0],
    contact: '', email: '', password: ''
  });

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : true);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const defaultSettings = {
    addedByEmail: 'aarushpraka@gmail.com',
    currency: '₹',
    flatLimit: 10,
    homeMonth: MONTHS[new Date().getMonth()],
    homeYear: String(new Date().getFullYear()),
    homeView: 'currentMonth',
    showInactive: false,
    pageSize: 10,
    locale: 'en-IN'
  };
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('adminSettings');
    return raw ? JSON.parse(raw) : defaultSettings;
  });

  const numberFmt = useMemo(() => new Intl.NumberFormat(settings.locale || 'en-IN', {
    style: 'currency',
    currency: settings.currencyCode || 'INR',
    currencyDisplay: 'symbol',
  }), [settings.locale, settings.currencyCode]);


  const [filterTenantId, setFilterTenantId] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAddedBy, setFilterAddedBy] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [billPage, setBillPage] = useState(1);

  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantSort, setTenantSort] = useState('flatAsc');

  const [bulkTenantId, setBulkTenantId] = useState('all');
  const [bulkUseTenantRent, setBulkUseTenantRent] = useState(true);
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkStartMonth, setBulkStartMonth] = useState(MONTHS[new Date().getMonth()]);
  const [bulkStartYear, setBulkStartYear] = useState(String(new Date().getFullYear()));
  const [bulkEndMonth, setBulkEndMonth] = useState(MONTHS[new Date().getMonth()]);
  const [bulkEndYear, setBulkEndYear] = useState(String(new Date().getFullYear()));
  const [bulkLoading, setBulkLoading] = useState(false);

  const saveSettings = (next) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    localStorage.setItem('adminSettings', JSON.stringify(merged));
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      const tenantQ = query(collection(db, 'users'), where('role', '==', TENANT_ROLE));
      const tenantSnap = await getDocs(tenantQ);
      const tenantData = tenantSnap.docs.map(docu => ({
        id: docu.id,
        active: docu.data().active !== false,
        ...docu.data()
      }));
      setTenants(tenantData);
      const all = [];
      for (const t of tenantData) {
        const billsRef = collection(db, 'users', t.id, 'bill');
        const snap = await getDocs(billsRef);
        snap.forEach(d => all.push({ id: d.id, tenantId: t.id, ...d.data(), amount: Number(d.data().amount) }));
      }
      setBills(all);
    } catch {
      setFormError('Error loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);
  useEffect(() => {
    const now = new Date();
    const currentMonth = MONTHS[now.getMonth()];
    const currentYear = now.getFullYear();

    setFilterMonth(currentMonth);
    setFilterYear(currentYear);
  }, []);

  const getTenantUidFromBill = (bill, tenants = []) => {
    if (bill?.tenantUid) return bill.tenantUid;
    if (bill?.tenantId) {
      const t = tenants.find(x => x.id === bill.tenantId || x.uid === bill.tenantId || x.userUid === bill.tenantId);
      if (t?.uid) return t.uid;
      if (t?.userUid) return t.userUid;
      return bill.tenantId; // if your bills already store the actual auth UID here
    }
    if (bill?.uid) return bill.uid;
    return null;
  };

  const removeBill = async (bill) => {
    const tenantUid = getTenantUidFromBill(bill, tenants);
    if (!tenantUid || !bill?.id) {
      toast.error('Missing tenant UID or bill ID');
      return;
    }
    const ok = window.confirm(`Delete bill ${bill.refId || bill.id}?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, `users/${tenantUid}/bill/${bill.id}`));
      setBills(prev => prev.filter(b => b.id !== bill.id));
      toast.success('Bill removed');
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove bill');
    }
  };




  useEffect(() => {
    setBillPage(1);
  }, [filterTenantId, filterType, filterMonth, filterYear, filterStatus, filterAddedBy, filterSearch]);

  const byTenant = useMemo(() => {
    const m = new Map();
    for (const b of bills) {
      if (!m.has(b.tenantId)) m.set(b.tenantId, []);
      m.get(b.tenantId).push(b);
    }
    return m;
  }, [bills]);

  const totalRentAll = useMemo(() =>
    bills.filter(b => b.type === 'rent').reduce((s, b) => s + (Number(b.amount) || 0), 0), [bills]
  );
  const totalElecAll = useMemo(() =>
    bills.filter(b => b.type === 'electricity').reduce((s, b) => s + (Number(b.amount) || 0), 0), [bills]
  );

  const addedByOptions = useMemo(() => {
    const set = new Set(bills.map(b => b.addedBy).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [bills]);

  const yearOptions = useMemo(() => {
    const set = new Set(bills.map(b => String(b.year)).filter(Boolean));
    const base = Array.from(set).sort();
    const merged = Array.from(new Set([...base, ...YEARS]));
    return ['all', ...merged];
  }, [bills]);

  const filteredBills = useMemo(() => {
    const list = bills.filter(b => {
      if (filterTenantId && b.tenantId !== filterTenantId) return false;
      if (filterType !== 'all' && b.type !== filterType) return false;
      if (filterMonth !== 'all' && b.month !== filterMonth) return false;
      if (filterYear !== 'all' && String(b.year) !== String(filterYear)) return false;
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (filterAddedBy !== 'all' && b.addedBy !== filterAddedBy) return false;
      if (filterSearch) {
        const txt = `${b.refId || ''} ${b.type || ''} ${b.month || ''} ${b.year || ''}`.toLowerCase();
        if (!txt.includes(filterSearch.toLowerCase())) return false;
      }
      return true;
    });
    return list;
  }, [bills, filterTenantId, filterType, filterMonth, filterYear, filterStatus, filterAddedBy, filterSearch]);

  const totalsFiltered = useMemo(() => {
    const rent = filteredBills.filter(b => b.type === 'rent').reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const elec = filteredBills.filter(b => b.type === 'electricity').reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return { rent, elec, grand: rent + elec };
  }, [filteredBills]);

  const totalBillPages = useMemo(() => Math.max(1, Math.ceil(filteredBills.length / Number(settings.pageSize || 10))), [filteredBills.length, settings.pageSize]);

  const sortedBills = useMemo(() => {
    const toMillis = (b) => {
      if (b?.createdAt?.toDate) return b.createdAt.toDate().getTime();
      if (b?.createdAt?.seconds) return b.createdAt.seconds * 1000;
      if (b?.billFor) return new Date(b.billFor).getTime();
      return 0;
    };
    return filteredBills.slice().sort((a, b) => toMillis(b) - toMillis(a));
  }, [filteredBills]);

  const paginatedBills = useMemo(() => {
    const start = (billPage - 1) * Number(settings.pageSize || 10);
    return sortedBills.slice(start, start + Number(settings.pageSize || 10));
  }, [sortedBills, billPage, settings.pageSize]);

  useEffect(() => {
    if (billPage > totalBillPages) setBillPage(1);
  }, [billPage, totalBillPages]);

  const getCurrentBill = (tenantId, type) => {
    const list = byTenant.get(tenantId) || [];
    if (settings.homeView === 'currentMonth') {
      return list.find(b => b.type === type && b.month === settings.homeMonth && String(b.year) === String(settings.homeYear));
    }
    const sameType = list.filter(b => b.type === type);
    sameType.sort((a, b) => {
      const as = a?.createdAt?.seconds || 0;
      const bs = b?.createdAt?.seconds || 0;
      return bs - as;
    });
    return sameType[0];
  };

  const monthIndex = (m) => MONTHS.indexOf(m);
  const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const expandRange = (sMonth, sYear, eMonth, eYear) => {
    const sm = monthIndex(sMonth);
    const em = monthIndex(eMonth);
    let curY = parseInt(sYear, 10);
    let curM = sm;
    const endY = parseInt(eYear, 10);
    const endM = em;
    const out = [];
    while (curY < endY || (curY === endY && curM <= endM)) {
      out.push({ month: MONTHS[curM], year: String(curY), billFor: monthKey(curY, curM) });
      curM++;
      if (curM > 11) { curM = 0; curY++; }
    }
    return out;
  };

  const handleAddTenant = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const { name, flatNumber, rentAmount, joinedOn, contact, email, password } = newTenant;
    if (!name || !flatNumber || !rentAmount || !email || !password) { setFormError('Please fill all required fields.'); return; }
    if (Number.isNaN(Number(rentAmount))) { setFormError('Rent must be numeric.'); return; }
    if (tenants.some(t => `${t.flatNumber}`.trim() === `${flatNumber}`.trim())) { setFormError('Flat number already assigned.'); return; }
    setFormLoading(true);
    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      await setDoc(doc(db, 'users', uid), {
        name, flatNumber, rentAmount: Number(rentAmount),
        joinedOn, contact, role: TENANT_ROLE, email, active: true
      });
      setFormSuccess('Tenant added successfully.');
      setNewTenant({
        name: '', flatNumber: '', rentAmount: '',
        joinedOn: new Date().toISOString().split('T')[0],
        contact: '', email: '', password: ''
      });
      await refreshAll();
    } catch {
      setFormError('Failed to add tenant.');
    } finally {
      setFormLoading(false);
    }
  };

  const markBillPaid = async (b) => {
    if (!b?.tenantId || !b?.id) return;
    try {
      await updateDoc(doc(db, 'users', b.tenantId, 'bill', b.id), { status: 'Paid', updatedAt: serverTimestamp() });
      await refreshAll();
    } catch { }
  };

  const bulkMarkPaid = async () => {
    if (!filteredBills.length) return;
    const go = window.confirm(`Mark ${filteredBills.length} filtered bills as Paid?`);
    if (!go) return;
    for (const b of filteredBills) {
      if (b.status === 'Paid') continue;
      try {
        await updateDoc(doc(db, 'users', b.tenantId, 'bill', b.id), { status: 'Paid', updatedAt: serverTimestamp() });
      } catch { }
    }
    await refreshAll();
  };

  const exportCSV = (list = filteredBills, name = 'bills.csv') => {
    const rows = [['Tenant', 'Flat', 'Type', 'Month', 'Year', 'Amount', 'Status', 'Added By', 'Created At', 'Ref ID']];
    for (const b of list) {
      const t = tenants.find(x => x.id === b.tenantId);
      const created = b?.createdAt?.toDate ? b.createdAt.toDate().toISOString() : (b?.billFor || '');
      rows.push([
        t?.name || '', t?.flatNumber || '', b.type || '', b.month || '', String(b.year || ''),
        String(Number(b.amount) || 0), b.status || '', b.addedBy || '', created, b.refId || ''
      ]);
    }
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };



  const exportTenantStatement = (tenantId) => {
    const list = bills.filter(b => b.tenantId === tenantId);
    const t = tenants.find(x => x.id === tenantId);
    exportCSV(list, `statement_${t?.name || tenantId}.csv`);
  };

  const bulkCreateRentRange = async () => {
    setBulkLoading(true);
    try {
      const range = expandRange(bulkStartMonth, bulkStartYear, bulkEndMonth, bulkEndYear);
      const targets = bulkTenantId === 'all' ? tenants.filter(t => t.active !== false) : tenants.filter(t => t.id === bulkTenantId);
      const customAmount = Number(bulkAmount);
      for (const t of targets) {
        for (const r of range) {
          const billsRef = collection(db, 'users', t.id, 'bill');
          const dupQ = query(billsRef, where('type', '==', 'rent'), where('month', '==', r.month), where('year', '==', r.year));
          const dupSnap = await getDocs(dupQ);
          if (!dupSnap.empty) continue;
          const amount = bulkUseTenantRent ? Number(t.rentAmount || 0) : (Number.isNaN(customAmount) ? 0 : customAmount);
          const refId = `RENT-${r.month}-${r.year}-${t.id}`;
          await addDoc(billsRef, {
            addedBy: settings.addedByEmail,
            amount,
            billFor: r.billFor,
            createdAt: serverTimestamp(),
            month: r.month,
            note: '',
            refId,
            status: 'Pending',
            tenantId: t.id,
            type: 'rent',
            updatedAt: serverTimestamp(),
            year: r.year
          });
        }
      }
      await refreshAll();
      alert('Bulk rent bills created for selected range.');
    } catch {
      alert('Bulk creation failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const removeTenant = async (tenantId) => {
    const t = tenants.find(x => x.id === tenantId);
    const go = window.confirm(`Remove tenant ${t?.name || tenantId}? This deletes their bills.`);
    if (!go) return;
    try {
      const billsRef = collection(db, 'users', tenantId, 'bill');
      const snap = await getDocs(billsRef);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'users', tenantId, 'bill', d.id));
      }
      await deleteDoc(doc(db, 'users', tenantId));
      await refreshAll();
      alert('Tenant removed.');
    } catch {
      alert('Failed to remove tenant.');
    }
  };

  const toggleActiveTenant = async (tenantId, active) => {
    try {
      await updateDoc(doc(db, 'users', tenantId), { active });
      await refreshAll();
    } catch { }
  };

  const updateTenantDetails = async (tenantId, data) => {
    try {
      await updateDoc(doc(db, 'users', tenantId), data);
      await refreshAll();
    } catch { }
  };

  const overdue = (b) => {
    if (b.status === 'Paid') return false;
    const nowY = new Date().getFullYear();
    const nowM = new Date().getMonth();
    const y = parseInt(b.year, 10);
    const m = MONTHS.indexOf(b.month);
    return y < nowY || (y === nowY && m < nowM);
  };

  const filteredTenants = useMemo(() => {
    let list = tenants.filter(t => settings.showInactive ? true : (t.active !== false));
    if (tenantSearch) {
      const s = tenantSearch.toLowerCase();
      list = list.filter(t => `${t.name || ''} ${t.flatNumber || ''}`.toLowerCase().includes(s));
    }
    if (tenantSort === 'flatAsc') list.sort((a, b) => String(a.flatNumber).localeCompare(String(b.flatNumber)));
    if (tenantSort === 'flatDesc') list.sort((a, b) => String(b.flatNumber).localeCompare(String(a.flatNumber)));
    if (tenantSort === 'nameAsc') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (tenantSort === 'nameDesc') list.sort((a, b) => String(b.name).localeCompare(String(a.name)));
    return list;
  }, [tenants, tenantSearch, tenantSort, settings.showInactive]);

  const monthlyTotals = useMemo(() => {
    const y = settings.homeYear;
    const out = MONTHS.map(m => {
      const rent = bills.filter(b => b.type === 'rent' && String(b.year) === String(y) && b.month === m).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const elec = bills.filter(b => b.type === 'electricity' && String(b.year) === String(y) && b.month === m).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      return { month: m, rent, elec, total: rent + elec };
    });
    return out;
  }, [bills, settings.homeYear]);

  const inlineUpdateNote = async (b, note) => {
    try {
      await updateDoc(doc(db, 'users', b.tenantId, 'bill', b.id), { note, updatedAt: serverTimestamp() });
      await refreshAll();
    } catch { }
  };

  const inlineChangeStatus = async (b, status) => {
    try {
      await updateDoc(doc(db, 'users', b.tenantId, 'bill', b.id), { status, updatedAt: serverTimestamp() });
      await refreshAll();
    } catch { }
  };

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth).catch(() => { });
  };

  return (
    <div className="admin-dashboard" style={{ backgroundColor: 'red' }}>
      <div className="admin-layout">
        {!isMobile && (
          <aside className="sidebar-left sidebar-fixed">
            <div className="sidebar-header">
              <h3 className="sidebar-title">⚡ Quick Actions</h3>
            </div>
            <ul className="quick-action-list">
              <li className="quick-action-item" onClick={() => { setActivePanel(null); }}><FaHome style={iconStyle} /> Home</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('addTenant'); }}><FaPlus style={iconStyle} /> Add Tenant</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('setRent'); }}><FaMoneyBillWave style={iconStyle} /> Set Rent</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('setElectricity'); }}><FaBolt style={iconStyle} /> Set Electricity</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('bulk'); }}><FaLayerGroup style={iconStyle} /> Bulk Tools</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('billList'); }}><FaReceipt style={iconStyle} /> All Bills</li>
              <li className="quick-action-item" onClick={() => { setActivePanel('settings'); }}><FaCog style={iconStyle} /> Settings</li>

            </ul>
          </aside>
        )}

        <main className={`admin-main ${isMobile ? 'mobile' : 'desktop'}`}>
          <div className="dashboard-header">
            <h2 className="dashboard-title">Admin Dashboard</h2>
            <div className="header-actions">
              <button className="btn logout-icon" onClick={handleLogout} title="Logout">
                <FiLogOut />
              </button>
            </div>
          </div>

          <div className="dashboard-body">
            {activePanel === 'addTenant' && (
              <div className="tenant-form-container">
                <h2 className="form-heading">Add New Tenant</h2>
                <form onSubmit={handleAddTenant} className="tenant-form">
                  <div className="form-group">
                    <input className="input" type="text" placeholder="Tenant Name" value={newTenant.name} onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })} required />
                    <input className="input" type="text" placeholder="Flat Number" value={newTenant.flatNumber} onChange={(e) => setNewTenant({ ...newTenant, flatNumber: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <input className="input" type="number" placeholder="Rent Amount" value={newTenant.rentAmount} onChange={(e) => setNewTenant({ ...newTenant, rentAmount: e.target.value })} required />
                    <input className="input" type="date" value={newTenant.joinedOn} onChange={(e) => setNewTenant({ ...newTenant, joinedOn: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <input className="input" type="email" placeholder="Email" value={newTenant.email} onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })} required />
                    <input className="input" type="password" placeholder="Password" value={newTenant.password} onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })} required />
                  </div>
                  {formError && <p className="form-error">⚠️ {formError}</p>}
                  {formSuccess && <p className="form-success">✅ {formSuccess}</p>}
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Saving...' : 'Add Tenant'}</button>
                </form>
              </div>
            )}

            {activePanel === 'setRent' && (
              <BillingForm
                type="rent"
                tenants={tenants}
                addedByEmail={settings.addedByEmail}
                onRefreshBills={refreshAll}


              />
            )}

            {activePanel === 'setElectricity' && (
              <BillingForm
                type="electricity"
                tenants={tenants}
                addedByEmail={settings.addedByEmail}
                onRefreshBills={refreshAll}


              />
            )}

            {activePanel === 'bulk' && (

              <div className="tenant-form-container">
                <h2 className="form-heading">Bulk Rent Creation</h2>
                <form onSubmit={(e) => e.preventDefault()} className="tenant-form">
                  <div className="form-group">
                    <select className="select" value={bulkTenantId} onChange={(e) => setBulkTenantId(e.target.value)}>
                      <option value="all">All Active Tenants</option>
                      {tenants.filter(t => t.active !== false).map(t => (
                        <option key={t.id} value={t.id}>{t.name} (Flat {t.flatNumber})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <select className="select" value={bulkStartMonth} onChange={(e) => setBulkStartMonth(e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="select" value={bulkStartYear} onChange={(e) => setBulkStartYear(e.target.value)}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <span className="range-to">to</span>
                    <select className="select" value={bulkEndMonth} onChange={(e) => setBulkEndMonth(e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="select" value={bulkEndYear} onChange={(e) => setBulkEndYear(e.target.value)}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="checkbox">
                      <input type="checkbox" checked={bulkUseTenantRent} onChange={(e) => setBulkUseTenantRent(e.target.checked)} />
                      Use tenant rent amount
                    </label>
                    {!bulkUseTenantRent && (
                      <input className="input" type="number" placeholder="Custom amount" value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)} />
                    )}
                  </div>
                  <button type="button" className="btn btn-primary" disabled={bulkLoading} onClick={bulkCreateRentRange}>
                    {bulkLoading ? 'Creating...' : 'Create Rent Bills'}
                  </button>
                </form>
              </div>
            )}

            {activePanel === 'billList' && (
              <div className="bill-list-container">
                <h2 className="form-heading">All Bills</h2>
                <div className="filters-row">
                  <select className="select" value={filterTenantId} onChange={(e) => { setFilterTenantId(e.target.value); }}>
                    <option value="">All Tenants</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name} (Flat {t.flatNumber})</option>)}
                  </select>
                  <select className="select" value={filterType} onChange={(e) => { setFilterType(e.target.value); }}>
                    <option value="all">All Types</option>
                    <option value="rent">Rent</option>
                    <option value="electricity">Electricity</option>
                  </select>
                  <select className="select" value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); }}>
                    <option value="all">All Months</option>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="select" value={filterYear} onChange={(e) => { setFilterYear(e.target.value); }}>
                    {yearOptions.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
                  </select>
                  <select className="select" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); }}>
                    <option value="all">All Status</option>
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <select className="select" value={filterAddedBy} onChange={(e) => { setFilterAddedBy(e.target.value); }}>
                    {addedByOptions.map(a => <option key={a} value={a}>{a === 'all' ? 'All Added By' : a}</option>)}
                  </select>
                  <span className="search-input">
                    <FaSearch style={{ marginRight: 6 }} />
                    <input className="input" type="text" placeholder="Search ref/type/month/year" value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); }} />
                  </span>
                  <button className="btn" onClick={() => { setFilterTenantId(''); setFilterType('all'); setFilterMonth('all'); setFilterYear('all'); setFilterStatus('all'); setFilterAddedBy('all'); setFilterSearch(''); }}>Reset</button>
                  <button className="btn" onClick={() => exportCSV()}><FaDownload style={{ marginRight: 6 }} />Export CSV</button>
                  <button className="btn btn-primary" onClick={bulkMarkPaid}><FaCheck style={{ marginRight: 6 }} />Mark All Filtered Paid</button>
                </div>

                <div className="summary-cards">
                  <SummaryCard label={<><FaMoneyBillWave style={iconStyle} /> Total Rent (filtered)</>} value={`₹${(totalsFiltered.rent)}`} />
                  <SummaryCard label={<><FaBolt style={iconStyle} /> Total Electricity (filtered)</>} value={`₹${(totalsFiltered.elec)}`} />
                  <SummaryCard label={<><FaReceipt style={iconStyle} /> Grand Total (filtered)</>} value={`₹${(totalsFiltered.grand)}`} />
                </div>

                <div className="tenant-table bill-table">
                  <h3 className="table-title"><FaReceipt style={iconStyle} /> Bill List</h3>
                  <table className="table">
                    <thead className="thead">
                      <tr>
                        <th>Tenant</th>
                        <th>Flat</th>
                        <th>Type</th>
                        <th>Month</th>
                        <th>Year</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Overdue</th>
                        <th>Added By</th>
                        <th>Created At</th>
                        <th>Ref ID</th>
                        <th>Note</th>
                        {/* Split Actions into two columns */}
                        <th>Mark paid</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody className="tbody">
                      {paginatedBills.map((b, idx) => {
                        const tenant = tenants.find(t => t.id === b.tenantId);
                        const created = b?.createdAt?.toDate
                          ? b.createdAt.toDate().toLocaleString()
                          : (b?.billFor ? new Date(b.billFor).toLocaleString() : '-');
                        return (
                          <tr key={(b.tenantId || '') + (b.id || idx)}>
                            <td>{tenant?.name || '-'}</td>
                            <td>{tenant?.flatNumber || '-'}</td>
                            <td>{b.type}</td>
                            <td>{b.month}</td>
                            <td>{b.year}</td>
                            <td>{numberFmt.format(Number(b.amount) || 0)}</td>
                            <td>
                              <select
                                className="select small"
                                value={b.status}
                                onChange={(e) => inlineChangeStatus(b, e.target.value)}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                              </select>
                            </td>
                            <td>{overdue(b) ? '⚠️' : ''}</td>
                            <td>{b.addedBy || '-'}</td>
                            <td>{created}</td>
                            <td>{b.refId || '-'}</td>
                            <td>
                              <input
                                className="input small"
                                type="text"
                                defaultValue={b.note || ''}
                                onBlur={(e) => inlineUpdateNote(b, e.target.value)}
                                placeholder="Add note"
                              />
                            </td>

                            {/* New separate column for Mark Paid */}
                            <td>
                              <button
                                className="btn btn-small"
                                disabled={b.status === 'Paid'}
                                onClick={() => markBillPaid(b)}
                              >
                                Mark Paid
                              </button>
                            </td>

                            {/* New separate column for Delete */}
                            <td>
                              <button
                                className="btn btn-small"
                                style={{ background: 'linear-gradient(135deg, #e53935, #b71c1c)' }}
                                onClick={() => removeBill(b)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {paginatedBills.length === 0 && (
                        <tr>
                          {/* Increase colSpan by 1 (13 -> 14) since we split Actions into two columns */}
                          <td className="no-bills" colSpan="14" style={{ textAlign: 'center' }}>
                            No bills found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>


                  <div className="pagination">
                    <span>Page</span>
                    <button className="btn btn-icon" disabled={billPage <= 1} onClick={() => setBillPage(p => Math.max(1, p - 1))}><FaChevronLeft /></button>
                    <span className="page-indicator">{billPage}/{totalBillPages}</span>
                    <button className="btn btn-icon" disabled={billPage >= totalBillPages} onClick={() => setBillPage(p => Math.min(totalBillPages, p + 1))}><FaChevronRight /></button>
                    <select className="select" value={settings.pageSize} onChange={(e) => saveSettings({ pageSize: parseInt(e.target.value, 10) || 10 })}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="summary-cards" style={{ marginTop: 16 }}>
                  <SummaryCard
                    label={<><FaMoneyBillWave style={iconStyle} /> Total Rent (all)</>}
                    value={numberFmt.format(totalRentAll)}
                  />
                  <SummaryCard
                    label={<><FaBolt style={iconStyle} /> Total Electricity (all)</>}
                    value={numberFmt.format(totalElecAll)}
                  />
                  <SummaryCard
                    label={<><FaReceipt style={iconStyle} /> Grand Total (all)</>}
                    value={numberFmt.format(totalRentAll + totalElecAll)}
                  />
                </div>
              </div>
            )}


            {activePanel === 'settings' && (
              <div className="settings-panel">
                <h2 className="sp-heading">Settings</h2>

                <form onSubmit={(e) => e.preventDefault()} className="sp-form">
                  <div className="sp-group">
                    <input className="sp-input sp-span-6" type="email" placeholder="Default Added By Email" value={settings.addedByEmail} onChange={(e) => saveSettings({ addedByEmail: e.target.value })} />
                    <input className="sp-input sp-span-6" type="text" placeholder="Currency Symbol" value={settings.currency} onChange={(e) => saveSettings({ currency: e.target.value })} />
                  </div>

                  <div className="sp-group">
                    <input className="sp-input sp-span-6" type="number" placeholder="Flat Limit" value={settings.flatLimit} onChange={(e) => saveSettings({ flatLimit: Number(e.target.value) || 0 })} />
                    <select className="sp-select sp-span-6" value={settings.homeView} onChange={(e) => saveSettings({ homeView: e.target.value })}>
                      <option value="currentMonth">Home shows current month</option>
                      <option value="latest">Home shows latest bill</option>
                    </select>
                  </div>

                  <div className="sp-group">
                    <select className="sp-select sp-span-3" value={settings.homeMonth} onChange={(e) => saveSettings({ homeMonth: e.target.value })}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="sp-select sp-span-3" value={settings.homeYear} onChange={(e) => saveSettings({ homeYear: e.target.value })}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <label className="sp-checkbox sp-span-3">
                      <input type="checkbox" checked={settings.showInactive} onChange={(e) => saveSettings({ showInactive: e.target.checked })} />
                      Show inactive tenants
                    </label>
                    <select className="sp-select sp-span-3" value={settings.locale} onChange={(e) => saveSettings({ locale: e.target.value })}>
                      <option value="en-IN">India (en-IN)</option>
                      <option value="en-US">US (en-US)</option>
                      <option value="hi-IN">Hindi (hi-IN)</option>
                    </select>
                  </div>

                  <div className="sp-group">
                    <div className="sp-span-4">
                      <label className="sp-label">Bills per page</label>
                      <select className="sp-select" value={settings.pageSize} onChange={(e) => saveSettings({ pageSize: parseInt(e.target.value, 10) || 10 })}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="sp-span-4"></div>
                    <div className="sp-span-4" style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end' }}>

                    </div>
                  </div>
                </form>

                <h3 className="sp-section-title">Tenant Management</h3>




                <div className="tenant-table">
                  <table className="sp-table">
                    <thead className="sp-thead">
                      <tr>
                        <th>Flat</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Rent</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="sp-tbody">
                      {filteredTenants.map(t => (
                        <tr key={t.id}>
                          <td>{t.flatNumber}</td>
                          <td><input className="sp-input small" type="text" defaultValue={t.name} onBlur={(e) => updateTenantDetails(t.id, { name: e.target.value })} /></td>
                          <td><input className="sp-input small" type="email" defaultValue={t.email} onBlur={(e) => updateTenantDetails(t.id, { email: e.target.value })} /></td>
                          <td><input className="sp-input small" type="number" defaultValue={t.rentAmount} onBlur={(e) => updateTenantDetails(t.id, { rentAmount: Number(e.target.value || 0) })} /></td>
                          <td>
                            <label className="sp-checkbox">
                              <input type="checkbox" checked={t.active !== false} onChange={(e) => toggleActiveTenant(t.id, e.target.checked)} />
                              {t.active !== false ? 'Active' : 'Inactive'}
                            </label>
                          </td>
                          <td>{t.joinedOn}</td>
                          <td className="sp-actions">
                            <button className="sp-btn small" onClick={() => exportTenantStatement(t.id)}><FaDownload style={{ marginRight: 4 }} />Statement</button>
                            <button className="sp-btn small danger" onClick={() => removeTenant(t.id)}><FaTrash style={{ marginRight: 4 }} />Remove</button>
                          </td>
                        </tr>
                      ))}
                      {filteredTenants.length === 0 && (
                        <tr><td className="sp-empty" colSpan="7">No tenants.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}


            {!activePanel && !loading && (
              <>
                <div className="summary-cards">
                  <SummaryCard label={<><FaUser style={iconStyle} /> Total Tenants</>} value={tenants.filter(t => settings.showInactive ? true : (t.active !== false)).length} />
                  <SummaryCard label={<><FaMoneyBillWave style={iconStyle} /> Total Rent</>} value={numberFmt.format(totalRentAll)} />
                  <SummaryCard label={<><FaBolt style={iconStyle} /> Total Electricity </>} value={(totalsFiltered.elec)} />
                  <SummaryCard label={<><FaBuilding style={iconStyle} /> Flats Occupied</>} value={`${tenants.filter(t => t.active !== false).length} / ${settings.flatLimit}`} />
                  <SummaryCard label={<><FaExclamationTriangle style={iconStyle} /> Rent Pending</>} value={
                    tenants.filter(t => {
                      const b = getCurrentBill(t.id, 'rent');
                      return t.active !== false && (!b || b.status !== 'Paid');
                    }).length
                  } />
                </div>

                <div className="tenant-table">
                  <div className="filters-row">
                    <span className="search-input">
                      <FaSearch style={{ marginRight: 6 }} />
                      <input className="input" type="text" placeholder="Search tenant name or flat" value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} />
                    </span>
                    <select className="select" value={tenantSort} onChange={(e) => setTenantSort(e.target.value)}>
                      <option value="flatAsc">Flat ↑</option>
                      <option value="flatDesc">Flat ↓</option>
                      <option value="nameAsc">Name A-Z</option>
                      <option value="nameDesc">Name Z-A</option>
                    </select>
                  </div>
                  <h3 className="table-title"><FaHome style={iconStyle} /> Tenant List ({settings.homeView === 'currentMonth' ? `${settings.homeMonth} ${settings.homeYear}` : 'Latest bills'})</h3>
                  <table className="table">
                    <thead className="thead">
                      <tr>
                        <th>Flat</th>
                        <th>Name</th>
                        <th>Rent</th>
                        <th>Rent Status</th>
                        <th>Electricity</th>
                        <th>Elec Status</th>
                        <th>Joined On</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="tbody">
                      {filteredTenants.map(t => {
                        const rentBill = getCurrentBill(t.id, 'rent');
                        const elecBill = getCurrentBill(t.id, 'electricity');
                        return (
                          <tr key={t.id}>
                            <td>{t.flatNumber}</td>
                            <td>{t.name}</td>
                            <td>{rentBill ? `${numberFmt.format(Number(rentBill.amount) || 0)}` : '-'}</td>
                            <td className={rentBill?.status === 'Paid' ? 'paid' : 'due'}>
                              {rentBill
                                ? rentBill.status === 'Paid'
                                  ? '✅ Paid'
                                  : overdue(rentBill)
                                    ? '⚠️ Overdue'
                                    : '❌ Pending'
                                : '—'}
                            </td>
                            <td>{elecBill ? `${numberFmt.format(Number(elecBill.amount) || 0)}` : '-'}</td>
                            <td className={elecBill?.status === 'Paid' ? 'paid' : 'due'}>
                              {elecBill
                                ? elecBill.status === 'Paid'
                                  ? '✅ Paid'
                                  : overdue(elecBill)
                                    ? '⚠️ Overdue'
                                    : '❌ Pending'
                                : '—'}
                            </td>
                            <td>{t.joinedOn}</td>
                            <td>
                              <button className="btn btn-small" onClick={() => exportTenantStatement(t.id)}><FaDownload style={{ marginRight: 4 }} />Statement</button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredTenants.length === 0 && (
                        <tr><td className="no-tenants" colSpan="8" style={{ textAlign: 'center' }}>No tenants found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
                  <div className="bill-list-container">
                    <h2 className="form-heading">Monthly Total</h2>

                    <div className="summary-cards">
                      <SummaryCard label={<><FaMoneyBillWave style={iconStyle} /> Total Rent</>} value={`₹${totalsFiltered.rent}`} />
                      <SummaryCard label={<><FaBolt style={iconStyle} /> Total Electricity</>} value={`₹${totalsFiltered.elec}`} />
                      <SummaryCard label={<><FaReceipt style={iconStyle} /> Grand Total</>} value={`₹${totalsFiltered.grand}`} />
                    </div>

                    <div className="tenant-table bill-table">
                      <h3 className="table-title"><FaReceipt style={iconStyle} /> Bills for {filterMonth} {filterYear}</h3>

                      <div className="table-wrapper">
                        <table className="table">
                          <thead className="thead">
                            <tr>
                              <th>Tenant</th>
                              <th>Flat</th>
                              <th>Type</th>
                              <th>Month</th>
                              <th>Year</th>
                              <th className="ta-right">Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody className="tbody">
                            {paginatedBills.length > 0 ? paginatedBills.map((b, idx) => {
                              const tenant = tenants.find(t => t.id === b.tenantId);
                              return (
                                <tr key={(b.tenantId || '') + (b.id || idx)}>
                                  <td>{tenant?.name || '-'}</td>
                                  <td>{tenant?.flatNumber || '-'}</td>
                                  <td className="cap">{b.type}</td>
                                  <td>{b.month}</td>
                                  <td>{b.year}</td>
                                  <td className="ta-right">{numberFmt.format(Number(b.amount) || 0)}</td>
                                  <td>{b.status}</td>
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td className="no-bills" colSpan="7" style={{ textAlign: 'center' }}>
                                  No bills found for this month.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="pagination">
                        <span>Page</span>
                        <button className="btn btn-icon" disabled={billPage <= 1} onClick={() => setBillPage(p => Math.max(1, p - 1))}>
                          <FaChevronLeft />
                        </button>
                        <span className="page-indicator">{billPage}/{totalBillPages}</span>
                        <button className="btn btn-icon" disabled={billPage >= totalBillPages} onClick={() => setBillPage(p => Math.min(totalBillPages, p + 1))}>
                          <FaChevronRight />
                        </button>
                        <select className="select" value={settings.pageSize} onChange={(e) => saveSettings({ pageSize: parseInt(e.target.value, 10) || 10 })}>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                        </select>

                      </div>
                    </div>
                  </div>
                </div>






              </>
            )}

            {loading && (
              <div className="loader">Loading dashboard...</div>
            )}
          </div>
        </main>
      </div>

      {isMobile && (
        <nav className="bottom-nav">
          <button className="btn-nav" onClick={() => setActivePanel(null)}><FaHome /><span>Home</span></button>
          <button className="btn-nav" onClick={() => setActivePanel('addTenant')}><FaPlus /><span>Tenant</span></button>
          <button className="btn-nav" onClick={() => setActivePanel('setRent')}><FaMoneyBillWave /><span>Rent</span></button>
          <button className="btn-nav" onClick={() => setActivePanel('billList')}><FaReceipt /><span>Bills</span></button>
          <button className="btn-nav" onClick={() => setActivePanel('settings')}><FaCog /><span>Settings</span></button>
        </nav>
      )}
    </div>
  );
};

export default AdminDashboard;


