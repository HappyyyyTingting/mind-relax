import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  confirmPasswordReset as firebaseConfirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { t, type I18nKey } from '../lib/i18n';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  confirmPasswordReset: (oobCode: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ERROR_MESSAGES: Record<string, I18nKey> = {
  'auth/invalid-credential': 'auth.invalidCredential',
  'auth/email-already-in-use': 'auth.emailInUse',
  'auth/weak-password': 'auth.weakPassword',
  'auth/invalid-email': 'auth.invalidEmail',
  'auth/network-request-failed': 'auth.networkFailed',
  'auth/user-not-found': 'auth.userNotFound',
  'auth/too-many-requests': 'auth.tooManyRequests',
  'auth/requires-recent-login': 'auth.requiresRecentLogin',
  'auth/expired-action-code': 'auth.expiredCode',
  'auth/invalid-action-code': 'auth.invalidCode',
};

function messageOf(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && code in ERROR_MESSAGES) return t(ERROR_MESSAGES[code]);
  return t('auth.operationFailed');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return {};
    } catch (error) {
      return { error: messageOf(error) };
    }
  };

  const signUp = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      return {};
    } catch (error) {
      return { error: messageOf(error) };
    }
  };

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
      return {};
    } catch (error) {
      return { error: messageOf(error) };
    }
  };

  const confirmPasswordReset = async (
    oobCode: string,
    password: string,
  ): Promise<{ error?: string }> => {
    try {
      await firebaseConfirmPasswordReset(auth, oobCode, password);
      return {};
    } catch (error) {
      return { error: messageOf(error) };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        resetPassword,
        confirmPasswordReset,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
