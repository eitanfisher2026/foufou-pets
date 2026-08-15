import { addDoc, arrayUnion, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase.js';

const COLLECTION = 'feedbackThreads';

export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: '🐛 באג' },
  { value: 'idea', label: '💡 רעיון' },
  { value: 'general', label: '💭 כללי' },
];

export async function createFeedbackThread({ userId, senderName, senderEmail, category, subject, text, currentView }) {
  const ref = await addDoc(collection(db, COLLECTION), {
    userId,
    senderName: senderName || '',
    senderEmail: senderEmail || '',
    category: category || 'general',
    subject: subject || '',
    currentView: currentView || '',
    createdAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    lastFrom: 'user',
    unreadByUser: false,
    unreadByAdmin: true,
    messages: [{ from: 'user', text, timestamp: Date.now() }],
  });
  return ref.id;
}

// No orderBy here on purpose - combining it with the userId equality
// filter would need a composite Firestore index; sorting the (small,
// per-user) result client-side avoids that entirely.
export async function listMyFeedbackThreads(userId) {
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byLastActivityDesc);
}

export async function listAllFeedbackThreads() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('lastActivityAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function byLastActivityDesc(a, b) {
  return (b.lastActivityAt?.toMillis?.() || 0) - (a.lastActivityAt?.toMillis?.() || 0);
}

export async function sendFeedbackMessage(threadId, from, text) {
  await updateDoc(doc(db, COLLECTION, threadId), {
    messages: arrayUnion({ from, text, timestamp: Date.now() }),
    lastActivityAt: serverTimestamp(),
    lastFrom: from,
    unreadByUser: from === 'admin',
    unreadByAdmin: from === 'user',
  });
}

export async function markFeedbackThreadRead(threadId, who) {
  await updateDoc(doc(db, COLLECTION, threadId), who === 'admin' ? { unreadByAdmin: false } : { unreadByUser: false });
}
