import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
  getDocsFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { Notebook, PageItem } from './pagination';

const env = import.meta.env || {};
export const activeFirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    firebaseConfigJson.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  firestoreDatabaseId:
    env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId,
};

const app = initializeApp(activeFirebaseConfig);
export const db = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

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
  return trimmed.length >= 1 ? trimmed : 'Sin título';
}

export function sanitizeContent(content: string): string {
  return (content || '').slice(0, MAX_CONTENT_LEN);
}

export interface ParsedAuthError {
  code: string;
  title: string;
  message: string;
  isUnauthorizedDomain: boolean;
  isPopupBlocked: boolean;
  currentHostname: string;
  projectId: string;
}

export function parseFirebaseAuthError(err: unknown): ParsedAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : 'auth/unknown';
  const rawMessage =
    err instanceof Error ? err.message : String(err || 'Error desconocido');
  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : 'tu-dominio.vercel.app';

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Dominio no autorizado en Firebase (Vercel)',
      message: `Para que el inicio de sesión con Google funcione en "${currentHostname}", debes agregar este dominio en la lista de Dominios Autorizados de Firebase Console.`,
      isUnauthorizedDomain: true,
      isPopupBlocked: false,
      currentHostname,
      projectId: activeFirebaseConfig.projectId,
    };
  }

  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment'
  ) {
    return {
      code,
      title: 'Ventana emergente bloqueada en el navegador',
      message:
        'Tu navegador móvil bloqueó la ventana emergente. Usa el botón "Ingresar por Redirección (Celular)" de abajo para iniciar sesión sin ventana emergente.',
      isUnauthorizedDomain: false,
      isPopupBlocked: true,
      currentHostname,
      projectId: activeFirebaseConfig.projectId,
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return {
      code,
      title: 'Ventana cerrada antes de terminar',
      message:
        'Se cerró la ventana de Google antes de completar el acceso. Si estás en celular o en Vercel y se cerró sola, verifica que el dominio esté autorizado o usa el modo de redirección.',
      isUnauthorizedDomain: false,
      isPopupBlocked: false,
      currentHostname,
      projectId: activeFirebaseConfig.projectId,
    };
  }

  return {
    code,
    title: 'No se pudo iniciar sesión con Google',
    message: rawMessage,
    isUnauthorizedDomain: false,
    isPopupBlocked: false,
    currentHostname,
    projectId: activeFirebaseConfig.projectId,
  };
}

export async function signInWithGooglePopup(): Promise<User> {
  // MUST be called synchronously from user click handler without prior awaits
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGoogleRedirect(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

/**
 * Converts a temporary draft-* ID into a permanent note-* ID once written.
 */
export function ensurePermanentNotebookId(id: string): string {
  if (id.startsWith('draft-')) {
    return id.replace(/^draft-/, 'note-');
  }
  return id;
}

/**
 * Loads all notebooks and their subcollection pages for the authenticated user directly from Firestore server.
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
    let nbSnap;
    try {
      nbSnap = await getDocsFromServer(nbQuery);
    } catch {
      nbSnap = await getDocs(nbQuery);
    }
    const loadedMap = new Map<string, Notebook>();

    for (const nbDoc of nbSnap.docs) {
      const nbData = nbDoc.data();
      const nbId = nbDoc.id;
      const pagesPath = `users/${safeUid}/notebooks/${nbId}/pages`;

      try {
        const pgQuery = query(
          collection(db, pagesPath),
          where('ownerId', '==', safeUid)
        );
        let pgSnap;
        try {
          pgSnap = await getDocsFromServer(pgQuery);
        } catch {
          pgSnap = await getDocs(pgQuery);
        }
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

        // Promote any previously saved draft-* ID to note-* so it is never filtered out
        const normalizedId = ensurePermanentNotebookId(nbId);
        const candidateNb: Notebook = {
          id: normalizedId,
          title:
            typeof nbData.title === 'string' ? nbData.title : 'Sin título',
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
        };

        const existing = loadedMap.get(normalizedId);
        if (!existing || candidateNb.updatedAt >= existing.updatedAt) {
          loadedMap.set(normalizedId, candidateNb);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, pagesPath);
      }
    }

    const loaded = Array.from(loadedMap.values());
    loaded.sort((a, b) => b.updatedAt - a.updatedAt);
    return loaded;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, notebooksPath);
  }
}

/**
 * Subscribes in real time to remote changes in the user's cloud notebooks across devices,
 * ignoring local pending writes so typing is never interrupted.
 */
export function subscribeToUserNotebooks(
  userId: string,
  onUpdate: (cloudNotebooks: Notebook[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const safeUid = sanitizeId(userId, 'u');
  const notebooksPath = `users/${safeUid}/notebooks`;
  const nbQuery = query(
    collection(db, notebooksPath),
    where('ownerId', '==', safeUid)
  );

  return onSnapshot(
    nbQuery,
    async (snapshot) => {
      // Ignore local pending writes to prevent self-echo loops while typing
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }
      try {
        const latest = await loadUserNotebooksFromCloud(userId);
        onUpdate(latest);
      } catch (err) {
        onError?.(err);
      }
    },
    (err) => {
      onError?.(err);
    }
  );
}

/**
 * Persists a single notebook and its pages to Firestore following strict create/update rules.
 */
export async function saveNotebookToCloud(
  userId: string,
  notebook: Notebook
): Promise<void> {
  // Do not save an empty untouched temporary draft to cloud until user writes or creates a page
  const hasAnyContent = notebook.pages.some(
    (p) => p.content.trim().length > 0
  );
  if (notebook.id.startsWith('draft-') && !hasAnyContent) {
    return;
  }

  const permanentId = ensurePermanentNotebookId(notebook.id);
  const safeUid = sanitizeId(userId, 'u');
  const safeNbId = sanitizeId(permanentId, 'nb');
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
  const permanentId = ensurePermanentNotebookId(notebookId);
  const safeNbId = sanitizeId(permanentId, 'nb');
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
  const normalizedId = ensurePermanentNotebookId(notebook.id);
  const legacyDraftId = normalizedId.startsWith('note-')
    ? normalizedId.replace(/^note-/, 'draft-')
    : notebook.id;

  const candidateNbIds = Array.from(
    new Set([
      sanitizeId(normalizedId, 'nb'),
      sanitizeId(legacyDraftId, 'nb'),
      sanitizeId(notebook.id, 'nb'),
    ])
  );

  for (const candNbId of candidateNbIds) {
    const pagesPath = `users/${safeUid}/notebooks/${candNbId}/pages`;
    // 1. Delete all pages found on the server in this notebook subcollection
    try {
      const pgQuery = query(
        collection(db, pagesPath),
        where('ownerId', '==', safeUid)
      );
      const pgSnap = await getDocs(pgQuery);
      for (const pgDoc of pgSnap.docs) {
        try {
          await deleteDoc(pgDoc.ref);
        } catch {}
      }
    } catch {}

    // 2. Also delete any locally known page IDs
    for (const page of notebook.pages) {
      const safePageId = sanitizeId(page.id, 'pg');
      const pagePath = `users/${safeUid}/notebooks/${candNbId}/pages/${safePageId}`;
      try {
        await deleteDoc(doc(db, pagePath));
      } catch {}
    }

    // 3. Delete the notebook document itself
    const nbPath = `users/${safeUid}/notebooks/${candNbId}`;
    try {
      await deleteDoc(doc(db, nbPath));
    } catch (error) {
      if (candNbId === sanitizeId(normalizedId, 'nb')) {
        handleFirestoreError(error, OperationType.DELETE, nbPath);
      }
    }
  }
}
