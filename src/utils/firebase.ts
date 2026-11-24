import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Notebook, PageItem } from './pagination';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Blueprint validation constants matching firebase-blueprint.json & firestore.rules
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const MAX_ID_LEN = 128;
const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 50000;

export function sanitizeId(id: string, fallbackPrefix: string = 'doc'): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, MAX_ID_LEN);
  if (cleaned.length >= 1 && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

export function sanitizeTitle(title: string): string {
  const trimmed = (title || '').trim().slice(0, MAX_TITLE_LEN);
  return trimmed.length >= 1 ? trimmed : 'Cuaderno sin título';
}

export function sanitizeContent(content: string): string {
  return (content || '').slice(0, MAX_CONTENT_LEN);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

/**
 * Loads all notebooks and their subcollection pages for the authenticated user.
 */
export async function loadUserNotebooksFromCloud(
  userId: string
): Promise<Notebook[]> {
  const safeUid = sanitizeId(userId, 'u');
  const notebooksPath = `users/${safeUid}/notebooks`;
  try {
    const nbQuery = query(
      collection(db, notebooksPath),
      where('ownerId', '==', safeUid)
    );
    const nbSnap = await getDocs(nbQuery);
    const loaded: Notebook[] = [];

    for (const nbDoc of nbSnap.docs) {
      const nbData = nbDoc.data();
      const nbId = nbDoc.id;
      const pagesPath = `users/${safeUid}/notebooks/${nbId}/pages`;

      try {
        const pgQuery = query(
          collection(db, pagesPath),
          where('ownerId', '==', safeUid)
        );
        const pgSnap = await getDocs(pgQuery);
        const rawPages: Array<PageItem & { pageNumber: number }> = [];

        pgSnap.forEach((pgDoc) => {
          const pData = pgDoc.data();
          rawPages.push({
            id: pgDoc.id,
            content: typeof pData.content === 'string' ? pData.content : '',
            pageNumber:
              typeof pData.pageNumber === 'number' ? pData.pageNumber : 0,
            updatedAt: pData.updatedAt?.toMillis?.() || Date.now(),
          });
        });

        rawPages.sort((a, b) => a.pageNumber - b.pageNumber);

        loaded.push({
          id: nbId,
          title:
            typeof nbData.title === 'string'
              ? nbData.title
              : 'Cuaderno sin título',
          createdAt: nbData.createdAt?.toMillis?.() || Date.now(),
          updatedAt: nbData.updatedAt?.toMillis?.() || Date.now(),
          pages:
            rawPages.length > 0
              ? rawPages.map(({ id, content, updatedAt }) => ({
                  id,
                  content,
                  updatedAt,
                }))
              : [
                  {
                    id: `pg-${Date.now()}-1`,
                    content: '',
                    updatedAt: Date.now(),
                  },
                ],
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, pagesPath);
      }
    }

    loaded.sort((a, b) => b.updatedAt - a.updatedAt);
    return loaded;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, notebooksPath);
  }
}

/**
 * Persists a single notebook and its pages to Firestore following strict create/update rules.
 */
export async function saveNotebookToCloud(
  userId: string,
  notebook: Notebook
): Promise<void> {
  const safeUid = sanitizeId(userId, 'u');
  const safeNbId = sanitizeId(notebook.id, 'nb');
  const nbDocPath = `users/${safeUid}/notebooks/${safeNbId}`;
  const nbRef = doc(db, nbDocPath);

  const safeTitle = sanitizeTitle(notebook.title);

  try {
    const existingNb = await getDoc(nbRef);
    if (!existingNb.exists()) {
      await setDoc(nbRef, {
        ownerId: safeUid,
        title: safeTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(nbRef, {
        title: safeTitle,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, nbDocPath);
  }

  // Sync each page in the subcollection
  for (let idx = 0; idx < notebook.pages.length; idx++) {
    const page = notebook.pages[idx];
    const safePageId = sanitizeId(page.id, `pg-${idx}`);
    const pageDocPath = `users/${safeUid}/notebooks/${safeNbId}/pages/${safePageId}`;
    const pageRef = doc(db, pageDocPath);
    const safeText = sanitizeContent(page.content);
    const clampedPageNum = Math.max(0, Math.min(10000, idx));

    try {
      const existingPage = await getDoc(pageRef);
      if (!existingPage.exists()) {
        await setDoc(pageRef, {
          ownerId: safeUid,
          notebookId: safeNbId,
          pageNumber: clampedPageNum,
          content: safeText,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(pageRef, {
          content: safeText,
          pageNumber: clampedPageNum,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, pageDocPath);
    }
  }
}

export async function deletePageFromCloud(
  userId: string,
  notebookId: string,
  pageId: string
): Promise<void> {
  const safeUid = sanitizeId(userId, 'u');
  const safeNbId = sanitizeId(notebookId, 'nb');
  const safePageId = sanitizeId(pageId, 'pg');
  const pageDocPath = `users/${safeUid}/notebooks/${safeNbId}/pages/${safePageId}`;
  try {
    await deleteDoc(doc(db, pageDocPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pageDocPath);
  }
}

export async function deleteNotebookFromCloud(
  userId: string,
  notebook: Notebook
): Promise<void> {
  const safeUid = sanitizeId(userId, 'u');
  const safeNbId = sanitizeId(notebook.id, 'nb');

  for (const page of notebook.pages) {
    const safePageId = sanitizeId(page.id, 'pg');
    const pagePath = `users/${safeUid}/notebooks/${safeNbId}/pages/${safePageId}`;
    try {
      await deleteDoc(doc(db, pagePath));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, pagePath);
    }
  }

  const nbPath = `users/${safeUid}/notebooks/${safeNbId}`;
  try {
    await deleteDoc(doc(db, nbPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, nbPath);
  }
}
