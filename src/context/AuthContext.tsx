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

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': '邮箱或密码不正确。',
  'auth/email-already-in-use': '该邮箱已注册。',
  'auth/weak-password': '密码至少需要 6 位。',
  'auth/user-not-found': '该邮箱未注册。',
  'auth/too-many-requests': '尝试次数过多，请稍后再试。',
  'auth/requires-recent-login': '出于安全考虑，请重新登录后再试。',
  'auth/expired-action-code': '链接已过期，请重新申请重置密码。',
  'auth/invalid-action-code': '链接无效，请重新申请重置密码。',
};

function messageOf(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code];
  return '操作失败，请稍后再试。';
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
