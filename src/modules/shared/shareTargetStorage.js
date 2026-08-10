// Mirrors the DB/store/key names in public/sw.js - the service worker
// writes shared photos here (see handleShareTarget), and the /share-target
// screen reads them back out once, then clears the slot.
const SHARE_DB_NAME = 'foufou-pets-share';
const SHARE_STORE_NAME = 'pending';
const SHARE_KEY = 'latest';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reads whatever the share sheet handed off (once), then clears it so a
 * page refresh doesn't re-import the same share again.
 */
export async function takePendingShare() {
  const db = await openShareDb();
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SHARE_STORE_NAME);
    const getReq = store.get(SHARE_KEY);
    getReq.onsuccess = () => resolve(getReq.result || null);
    getReq.onerror = () => reject(getReq.error);
    store.delete(SHARE_KEY);
  });
  db.close();
  return data;
}
