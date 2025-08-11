import { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

const useTenantData = () => {
    const [tenantData, setTenantData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const fetchTenantData = async() => {
            const user = auth.currentUser;
            if (!user) {
                if (isMounted) {
                    setError('User not logged in.');
                    setLoading(false);
                }
                return;
            }

            try {
                const snapshot = await getDoc(doc(db, 'users', user.uid));
                if (snapshot.exists()) {
                    if (isMounted) setTenantData(snapshot.data());
                } else {
                    if (isMounted) setError('Tenant data not found.');
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Error fetching tenant data:', err.message);
                    setError('Failed to load tenant data.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchTenantData();

        return () => {
            isMounted = false;
        };
    }, []);

    return { tenantData, loading, error };
};

export default useTenantData;