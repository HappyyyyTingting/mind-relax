import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SyncProvider } from '../context/SyncContext';
import { syncService } from '../services/SyncService';
import { useSyncEnabled } from '../lib/syncSettings';
import { AccountSettingsPage } from '../pages/AccountSettingsPage';
import { AiModelSettingsPage } from '../pages/AiModelSettingsPage';
import { AuthPage } from '../pages/AuthPage';
import { ChatPage } from '../pages/ChatPage';
import { DataSettingsPage } from '../pages/DataSettingsPage';
import { DetailPage } from '../pages/DetailPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { RecordPage } from '../pages/RecordPage';
import { ReviewPage } from '../pages/ReviewPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SyncSettingsPage } from '../pages/SyncSettingsPage';
import { TalkPage } from '../pages/TalkPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/**
 * Aligns cloud data when a user is signed in, but only while cloud sync is on.
 * Depending on the flag as well as the user makes turning the switch on run
 * the first align immediately, which is what uploads whatever accumulated
 * locally while sync was off.
 */
function SyncTrigger() {
  const { user } = useAuth();
  const syncEnabled = useSyncEnabled();

  useEffect(() => {
    if (user && syncEnabled) {
      void syncService.align();
    }
  }, [user, syncEnabled]);

  return null;
}

export function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <SyncTrigger />
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          {/* The old v0.5 start page; home is the composer now. */}
          <Route path="/list" element={<Navigate to="/" replace />} />
          <Route
            path="/talk"
            element={
              <RequireAuth>
                <TalkPage />
              </RequireAuth>
            }
          />
          <Route
            path="/record"
            element={
              <RequireAuth>
                <RecordPage />
              </RequireAuth>
            }
          />
          <Route
            path="/review"
            element={
              <RequireAuth>
                <ReviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/detail/:id"
            element={
              <RequireAuth>
                <DetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/edit/:id"
            element={
              <RequireAuth>
                <RecordPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/account"
            element={
              <RequireAuth>
                <AccountSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/sync"
            element={
              <RequireAuth>
                <SyncSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/ai-model"
            element={
              <RequireAuth>
                <AiModelSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/data"
            element={
              <RequireAuth>
                <DataSettingsPage />
              </RequireAuth>
            }
          />
        </Routes>
      </SyncProvider>
    </AuthProvider>
  );
}
