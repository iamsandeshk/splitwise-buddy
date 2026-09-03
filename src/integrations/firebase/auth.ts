import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signInWithPopup,
  signOut,
  browserLocalPersistence,
  type Auth,
  type User,
} from 'firebase/auth';
import { cordovaPopupRedirectResolver } from 'firebase/auth/cordova';
import { setLastAuthUid, clearLastAuthUid } from '@/lib/proAccess';

const firebaseConfig = {
  apiKey: 'AIzaSyBJ5SdoLInpi5-PPcqzxWz0UMS1Cq_Ibbg',
  authDomain: 'expensetracker-a2f34.firebaseapp.com',
  projectId: 'expensetracker-a2f34',
  storageBucket: 'expensetracker-a2f34.firebasestorage.app',
  messagingSenderId: '480038500173',
  appId: '1:480038500173:web:390e774d145fd6930a6904',
};

let app: FirebaseApp;
let auth: Auth;
let provider: GoogleAuthProvider;

const isNativePlatform = Capacitor.isNativePlatform();

function initializeFirebase() {
  if (!app) {
    app = getApps().length > 0
      ? getApps()[0]
      : initializeApp(firebaseConfig);

    /*
     * initializeAuth() is used on native so Firebase keeps the Google
     * session persisted inside the Capacitor WebView.
     *
     * The fallback handles hot reload / duplicate Firebase initialization.
     */
    try {
      auth = isNativePlatform
        ? initializeAuth(app, {
          persistence: indexedDBLocalPersistence,
          popupRedirectResolver: cordovaPopupRedirectResolver,
        })
        : getAuth(app);
    } catch (error) {
      console.warn(
        '[Auth] Firebase Auth was already initialized; reusing existing Auth instance.',
        error,
      );
      auth = getAuth(app);
    }

    if (!isNativePlatform) {
      void setPersistence(auth, browserLocalPersistence).catch((error) => {
        console.warn(
          '[Auth] Failed to enable browser local persistence:',
          error,
        );
      });
    }

    provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({
      prompt: 'select_account',
    });
  }

  return {
    auth,
    provider,
  };
}

export function getFirebaseApp(): FirebaseApp {
  return initializeFirebase().auth.app;
}

export function getFirebaseAuth(): Auth {
  return initializeFirebase().auth;
}

export function getCurrentGoogleUser(): User | null {
  return initializeFirebase().auth.currentUser;
}

export function getGooglePhotoUrl(
  user: User | null,
): string | undefined {
  if (!user) return undefined;

  const direct = user.photoURL?.trim();

  if (direct) {
    return direct;
  }

  const providerPhoto = user.providerData
    .find(
      (providerUser) =>
        providerUser.providerId === 'google.com',
    )
    ?.photoURL?.trim();

  return providerPhoto || undefined;
}

/**
 * Subscribe to Firebase authentication state.
 *
 * IMPORTANT:
 * localStorage's LAST_AUTH_UID_KEY is only a cache optimization.
 * Firebase currentUser/onAuthStateChanged is the real authentication state.
 */
export function subscribeGoogleAuth(
  listener: (user: User | null) => void,
) {
  const { auth: firebaseAuth } = initializeFirebase();

  return onAuthStateChanged(
    firebaseAuth,
    (user) => {
      console.log(
        '[Auth] Firebase auth state:',
        user
          ? {
            uid: user.uid,
            email: user.email,
            providerIds: user.providerData.map(
              (providerUser) => providerUser.providerId,
            ),
          }
          : null,
      );

      if (user?.uid) {
        setLastAuthUid(user.uid);
      }

      listener(user);
    },
    (error) => {
      console.error(
        '[Auth] Firebase auth-state error:',
        error,
      );

      /*
       * Do not call signOut() here.
       *
       * A listener error is not an explicit user logout.
       */
      listener(null);
    },
  );
}

/**
 * Sign in with Google.
 *
 * Native flow:
 *
 * Google native SDK
 *       ↓
 * Google ID/access token
 *       ↓
 * Firebase JS Auth
 *       ↓
 * Firebase currentUser
 *
 * Web flow:
 *
 * Firebase signInWithPopup()
 */
export async function signInWithGoogle(): Promise<User> {
  const {
    auth: firebaseAuth,
    provider: googleProvider,
  } = initializeFirebase();

  /*
   * Wait until Firebase has finished restoring the persisted session.
   */
  await firebaseAuth.authStateReady();

  /*
   * If Firebase already considers the user signed in, do not start another
   * Google account-selection flow.
   */
  if (firebaseAuth.currentUser) {
    const existingUser = firebaseAuth.currentUser;

    try {
      await existingUser.reload();
    } catch (error) {
      console.warn(
        '[Auth] Existing Firebase user reload failed; keeping session:',
        error,
      );
    }

    setLastAuthUid(existingUser.uid);

    return existingUser;
  }

  if (isNativePlatform) {
    try {
      console.log(
        '[Auth] Starting native Google Sign-In...',
      );

      /*
       * Credential Manager is enabled.
       *
       * skipNativeAuth=true means the native plugin supplies the Google
       * credential, while Firebase JS Auth establishes the Firebase session.
       */
      const nativeResult =
        await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
          useCredentialManager: true,
          scopes: ['profile', 'email'],
        });

      console.log(
        '[Auth] Native Google result received:',
        {
          hasIdToken: Boolean(
            nativeResult.credential?.idToken,
          ),
          hasAccessToken: Boolean(
            nativeResult.credential?.accessToken,
          ),
        },
      );

      const idToken =
        nativeResult.credential?.idToken ?? null;

      const accessToken =
        nativeResult.credential?.accessToken ?? null;

      if (!idToken && !accessToken) {
        throw new Error(
          'Google Sign-In completed, but no Google ID token or access token was returned.',
        );
      }

      /*
       * Exchange the native Google credential for a Firebase session.
       */
      const credential =
        GoogleAuthProvider.credential(
          idToken,
          accessToken,
        );

      const result =
        await signInWithCredential(
          firebaseAuth,
          credential,
        );

      try {
        await result.user.reload();
      } catch (error) {
        console.warn(
          '[Auth] User reload after Google sign-in failed; keeping session:',
          error,
        );
      }

      setLastAuthUid(result.user.uid);

      console.log(
        '[Auth] Firebase Google Sign-In successful:',
        {
          uid: result.user.uid,
          email: result.user.email,
        },
      );

      return result.user;
    } catch (error: unknown) {
      const err = error as {
        code?: string;
        message?: string;
        name?: string;
      };

      console.error(
        '[Auth] Native Google Sign-In FAILED:',
        {
          name: err.name ?? 'unknown',
          code: err.code ?? 'unknown',
          message:
            err.message ??
            String(error),
          firebaseUser:
            firebaseAuth.currentUser?.uid ??
            null,
        },
      );

      /*
       * Do not automatically start Firebase redirect here.
       * This is a native Android authentication flow.
       */
      throw error;
    }
  }

  /*
   * Web Google sign-in.
   */
  try {
    const result =
      await signInWithPopup(
        firebaseAuth,
        googleProvider,
      );

    try {
      await result.user.reload();
    } catch (error) {
      console.warn(
        '[Auth] User reload after web sign-in failed; keeping session:',
        error,
      );
    }

    setLastAuthUid(result.user.uid);

    return result.user;
  } catch (error: unknown) {
    const err = error as {
      code?: string;
      message?: string;
      name?: string;
    };

    console.error(
      '[Auth] Web Google Sign-In FAILED:',
      {
        name: err.name ?? 'unknown',
        code: err.code ?? 'unknown',
        message:
          err.message ??
          String(error),
      },
    );

    throw error;
  }
}

/**
 * Explicitly sign out the current Firebase/Google session.
 *
 * The UID-bound Pro cache is intentionally preserved so the same Google
 * account can immediately recover its cached Lifetime Pro entitlement after
 * signing in again.
 */
export async function signOutGoogle(): Promise<void> {
  const { auth: firebaseAuth } =
    initializeFirebase();

  /*
   * Remove the current UID marker first.
   */
  clearLastAuthUid();

  if (isNativePlatform) {
    try {
      await FirebaseAuthentication.signOut();
    } catch (error) {
      console.warn(
        '[Auth] Native Google sign-out failed; continuing with Firebase sign-out:',
        error,
      );
    }
  }

  await signOut(firebaseAuth);

  console.log('[Auth] Firebase sign-out completed.');
}
