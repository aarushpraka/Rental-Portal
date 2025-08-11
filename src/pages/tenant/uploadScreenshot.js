import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export async function uploadScreenshot(tenantId, billId, base64Data) {
    const docPath = `users/${tenantId}/bills/${billId}`;
    const ref = doc(db, docPath);

    await updateDoc(ref, {
        screenshot: base64Data
    });
}