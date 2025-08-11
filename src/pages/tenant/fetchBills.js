import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function fetchBills(tenantId) {
    if (!tenantId) throw new Error('Invalid tenantId');
    try {
        const billsRef = collection(db, 'users', tenantId, 'bill');
        const snapshot = await getDocs(billsRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error fetching bills:', error);
        throw error;
    }
}