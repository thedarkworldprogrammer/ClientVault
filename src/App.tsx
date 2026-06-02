/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { PublicShareViewer } from './components/PublicShareViewer';
import { ClientFile } from './types';
import { testConnection } from './firebase';
import { Loader2, Shield } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [shareToken, setShareToken] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('share');
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('clientvault-theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('clientvault-theme', theme);
  }, [theme]);

  const isAdmin = user?.uid === 'Od1XeGkGT2esKsPd6lJZ1x7KGzV2';

  // Handle temporary secure read-only public sharing link bypass
  if (shareToken) {
    return (
      <PublicShareViewer 
        token={shareToken} 
        onClose={() => {
          // Quietly remove param without reload to return to the beautiful Login state
          const url = new URL(window.location.href);
          url.searchParams.delete('share');
          window.history.pushState({}, '', url.toString());
          setShareToken(null);
        }} 
      />
    );
  }

  // Automatically switch tab to admin mode for administrators
  useEffect(() => {
    if (isAdmin) {
      setActiveTab('admin');
    } else {
      setActiveTab('files');
    }
  }, [user, isAdmin]);

  // Verify Firebase credentials status is healthy on applet initial load
  useEffect(() => {
    testConnection();
  }, []);

  if (loading) {
    return (
      <div 
        id="applet-loader"
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6"
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="relative flex items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <Shield className="w-4 h-4 text-blue-600 absolute" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-slate-800">Initializing ClientVault</h3>
            <p className="text-xs text-slate-400 mt-1">Establishing high-security connection tunnels</p>
          </div>
        </div>
      </div>
    );
  }

  // Route to Auth screen if user is unauthenticated
  if (!user) {
    return <Login />;
  }

  // Authenticated Portal View
  return (
    <div id="client-portal-shell" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex h-screen overflow-hidden text-slate-700 dark:text-slate-300 antialiased font-sans">
      {/* Sidebar navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        fileCount={files.length}
      />

      {/* Main viewport */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        {/* Dynamic header banner to enhance minimalist display branding and spacing */}
        <header id="client-header" className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-20 flex items-center justify-between px-10 shrink-0">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">
              {isAdmin && 'Admin Workspace Controls'}
              {!isAdmin && activeTab === 'files' && 'Client Dashboard'}
              {!isAdmin && activeTab === 'activity' && 'Portal Action History'}
              {!isAdmin && activeTab === 'settings' && 'Integration & Guidelines'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
              {isAdmin && 'Inspect high-security user directories and workspaces'}
              {!isAdmin && activeTab === 'files' && 'Manage and share your assets securely'}
              {!isAdmin && activeTab === 'activity' && 'Tamper-proof file interaction timeline logs'}
              {!isAdmin && activeTab === 'settings' && 'Zero-trust authorization schemas configurations'}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right mr-1 hidden sm:block">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {isAdmin ? 'System Administrator' : (user?.email?.split('@')[0] || 'Active Client')}
              </p>
              <p className={`text-xs font-semibold ${isAdmin ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {isAdmin ? 'Global Operator Mode' : 'Client Companion Account'}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-full border-2 border-white dark:border-slate-800 shadow-xs overflow-hidden flex items-center justify-center shrink-0 ${
              isAdmin ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
            }`}>
              {isAdmin ? (
                <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <div className="w-full h-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                  {(user?.email?.[0] || 'C').toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Core panel contents */}
        {isAdmin ? (
          <AdminDashboard />
        ) : (
          <Dashboard 
            activeTab={activeTab} 
            files={files} 
            setFiles={setFiles}
            theme={theme}
            setTheme={setTheme}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

