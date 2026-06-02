/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { PublicShareViewer } from './components/PublicShareViewer';
import { ClientFile } from './types';
import { testConnection } from './firebase';
import { Loader2, Shield, Menu, ChevronRight, Home, Folder, Activity, Settings, UploadCloud, CheckCircle, AlertCircle, X } from 'lucide-react';
import { motion } from 'motion/react';

const tabLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  files: { label: 'Files', icon: Folder },
  activity: { label: 'Activity', icon: Activity },
  settings: { label: 'Setup', icon: Settings },
  admin: { label: 'Admin', icon: Shield },
};

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitedHistory, setVisitedHistory] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error'; message: string }>>([]);

  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  useEffect(() => {
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        addToast(customEvent.detail.type, customEvent.detail.message);
      }
    };
    window.addEventListener('secure-upload-notification', handleNotification);
    return () => {
      window.removeEventListener('secure-upload-notification', handleNotification);
    };
  }, []);
  const [currentFolder, setCurrentFolder] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('folder');
  });

  const navigateToFolder = (folderPath: string | null) => {
    const url = new URL(window.location.href);
    if (folderPath) {
      url.searchParams.set('folder', folderPath);
    } else {
      url.searchParams.delete('folder');
    }
    window.history.pushState({}, '', url.toString());
    setCurrentFolder(folderPath);
  };

  useEffect(() => {
    const handleLocationChange = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const folderParam = urlParams.get('folder');
      if (folderParam !== currentFolder) {
        setCurrentFolder(folderParam);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    const interval = setInterval(handleLocationChange, 600);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(interval);
    };
  }, [currentFolder]);

  useEffect(() => {
    if (!activeTab) return;
    setVisitedHistory(prev => {
      const filtered = prev.filter(item => item !== activeTab);
      return [activeTab, ...filtered].slice(0, 4);
    });
  }, [activeTab]);

  const [shareToken, setShareToken] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('share');
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('clientvault-theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    // Set initial size
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('clientvault-theme', theme);
  }, [theme]);

  const isAdmin = user?.uid === 'Od1XeGkGT2esKsPd6lJZ1x7KGzV2';

  const [uploadStatus, setUploadStatus] = useState<{
    uploading: boolean;
    compressing: boolean;
    uploadProgress: number;
  }>({
    uploading: false,
    compressing: false,
    uploadProgress: 0,
  });

  useEffect(() => {
    const handleUploadState = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setUploadStatus(customEvent.detail);
      }
    };
    window.addEventListener('secure-upload-state', handleUploadState);
    return () => {
      window.removeEventListener('secure-upload-state', handleUploadState);
    };
  }, []);

  const handleQuickUpload = () => {
    if (isAdmin || uploadStatus.uploading) return;
    if (activeTab !== 'files') {
      setActiveTab('files');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('trigger-secure-upload'));
      }, 150);
    } else {
      window.dispatchEvent(new CustomEvent('trigger-secure-upload'));
    }
  };

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
    <div id="client-portal-shell" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex h-screen overflow-hidden text-slate-700 dark:text-slate-300 antialiased font-sans relative">
      {/* Sidebar navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        fileCount={files.length}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      {/* Main viewport */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        {/* Dynamic header banner to enhance minimalist display branding and spacing */}
        <header id="client-header" className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-20 flex items-center justify-between px-4 sm:px-10 shrink-0">
          <div className="flex items-center space-x-3.5 min-w-0">
            {/* Sidebar toggle menu button */}
            <button
              id="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-2 -ml-1 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-hidden transition shrink-0 cursor-pointer"
              aria-label="Toggle Sidebar"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>
            <div className="truncate">
              <h1 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-100 truncate">
                {isAdmin && 'Admin Workspace Controls'}
                {!isAdmin && activeTab === 'files' && 'Client Dashboard'}
                {!isAdmin && activeTab === 'activity' && 'Portal Action History'}
                {!isAdmin && activeTab === 'settings' && 'Integration & Guidelines'}
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {isAdmin && 'Inspect high-security user directories and workspaces'}
                {!isAdmin && activeTab === 'files' && 'Manage and share your assets securely'}
                {!isAdmin && activeTab === 'activity' && 'Tamper-proof file interaction timeline logs'}
                {!isAdmin && activeTab === 'settings' && 'Zero-trust authorization schemas configurations'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Quick Upload Primary Button for Clients */}
            {!isAdmin && (
              <motion.button
                id="btn-quick-upload-header"
                whileHover={!uploadStatus.uploading ? { scale: 1.03 } : {}}
                whileTap={!uploadStatus.uploading ? { scale: 0.97 } : {}}
                onClick={handleQuickUpload}
                disabled={uploadStatus.uploading}
                className={`relative overflow-hidden flex items-center space-x-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 font-semibold rounded-xl text-xs transition-all border font-sans ${
                  uploadStatus.uploading 
                    ? 'bg-blue-700 border-blue-800 text-blue-100 cursor-not-allowed shadow-inner' 
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-700 cursor-pointer shadow-xs shadow-blue-150 hover:shadow-md hover:shadow-blue-200/50 dark:shadow-none'
                }`}
              >
                {/* Visual Progress Bar Overlay */}
                {uploadStatus.uploading && (
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-white/20 dark:bg-white/10"
                    initial={{ width: '0%' }}
                    animate={{ width: `${uploadStatus.compressing ? 33 : uploadStatus.uploadProgress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.2 }}
                  />
                )}

                {/* Content aligned above progress layer */}
                <span className="relative z-10 flex items-center space-x-1.5">
                  {uploadStatus.uploading ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-blue-200" />
                  ) : (
                    <UploadCloud className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {uploadStatus.uploading ? (
                      uploadStatus.compressing ? (
                        <span>Compressing...</span>
                      ) : (
                        <span>Uploading {uploadStatus.uploadProgress}%</span>
                      )
                    ) : (
                      <>
                        <span className="hidden sm:inline">Quick Upload</span>
                        <span className="inline sm:hidden">Upload</span>
                      </>
                    )}
                  </span>
                </span>
              </motion.button>
            )}

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

        {/* Dynamic Breadcrumbs Navigation Trail */}
        <div id="breadcrumb-navigation-trail" className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-10 py-3 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-sans tracking-wide">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            <motion.button 
              id="breadcrumb-btn-root"
              whileHover={!isAdmin ? { scale: 1.03, x: 2 } : {}}
              whileTap={!isAdmin ? { scale: 0.97 } : {}}
              onClick={() => !isAdmin && (setActiveTab('files'), navigateToFolder(null))}
              className={`group flex items-center px-2.5 py-1 rounded-lg text-slate-500 transition-all duration-200 focus:outline-hidden ${!isAdmin ? 'cursor-pointer hover:text-slate-950 dark:hover:text-slate-150 hover:bg-slate-200/50 dark:hover:bg-slate-900/60' : 'cursor-default'}`}
              disabled={isAdmin}
            >
              <Home className="w-3.5 h-3.5 mr-1.5 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-200 shrink-0" />
              <span className="font-medium">Vault Root</span>
            </motion.button>
            <ChevronRight className="w-3 h-3 text-slate-350 dark:text-slate-705 shrink-0 mx-0.5 animate-pulse" />
            
            {isAdmin ? (
              <motion.span 
                whileHover={{ scale: 1.02 }}
                className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 dark:bg-emerald-400/5 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-all duration-200 cursor-default select-none shadow-2xs"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-2 shrink-0 animate-ping" />
                <Shield className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span>Admin Workspace Controls</span>
              </motion.span>
            ) : (
              <>
                {activeTab === 'files' && (
                  <>
                    <motion.button
                      id="breadcrumb-btn-all-files"
                      whileHover={currentFolder ? { scale: 1.03, x: 1 } : { scale: 1.02 }}
                      whileTap={currentFolder ? { scale: 0.97 } : {}}
                      onClick={() => currentFolder && navigateToFolder(null)}
                      className={`group flex items-center px-2.5 py-1 rounded-lg transition-all duration-205 focus:outline-hidden text-blue-600 dark:text-blue-400 font-semibold ${
                        currentFolder 
                          ? 'cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-900/60 border border-blue-500/10 hover:border-blue-500/20 shadow-2xs' 
                          : 'cursor-default bg-blue-500/10 dark:bg-blue-400/5 border border-blue-500/20 select-none shadow-2xs'
                      }`}
                      disabled={!currentFolder}
                    >
                      {!currentFolder && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mr-2 shrink-0 animate-pulse" />}
                      <Folder className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                      <span>All Client Files</span>
                    </motion.button>
                    
                    {currentFolder && (
                      currentFolder.split('/').filter(Boolean).map((segment, index, arr) => {
                        const pathUpToSegment = arr.slice(0, index + 1).join('/');
                        const isLastSegment = index === arr.length - 1;
                        return (
                          <React.Fragment key={pathUpToSegment}>
                            <ChevronRight className="w-3 h-3 text-slate-350 dark:text-slate-705 shrink-0 mx-0.5" />
                            <motion.button
                              id={`breadcrumb-folder-segment-${index}`}
                              whileHover={!isLastSegment ? { scale: 1.03, x: 1 } : { scale: 1.02 }}
                              whileTap={!isLastSegment ? { scale: 0.97 } : {}}
                              onClick={() => !isLastSegment && navigateToFolder(pathUpToSegment)}
                              className={`group flex items-center px-2.5 py-1 rounded-lg transition-all duration-205 focus:outline-hidden ${
                                isLastSegment
                                  ? 'cursor-default bg-blue-500/10 dark:bg-blue-400/5 border border-blue-500/30 font-semibold text-blue-700 dark:text-blue-300 shadow-2xs'
                                  : 'cursor-pointer text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/50 dark:hover:bg-slate-900/60 font-medium'
                              }`}
                              disabled={isLastSegment}
                            >
                              {isLastSegment && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mr-2 shrink-0 animate-pulse" />}
                              <span className="font-medium">{segment}</span>
                            </motion.button>
                          </React.Fragment>
                        );
                      })
                    )}
                  </>
                )}
                {activeTab === 'activity' && (
                  <motion.span 
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/10 dark:bg-blue-400/5 border border-blue-500/20 px-2.5 py-1 rounded-lg transition-all duration-200 cursor-default select-none shadow-2xs hover:border-blue-500/40 dark:hover:border-blue-400/30"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mr-2 shrink-0 animate-pulse" />
                    <Activity className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>Activity History</span>
                  </motion.span>
                )}
                {activeTab === 'settings' && (
                  <motion.span 
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/10 dark:bg-blue-400/5 border border-blue-500/20 px-2.5 py-1 rounded-lg transition-all duration-200 cursor-default select-none shadow-2xs hover:border-blue-500/40 dark:hover:border-blue-400/30"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mr-2 shrink-0 animate-pulse" />
                    <Settings className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>Setup & Guidelines</span>
                  </motion.span>
                )}
              </>
            )}
          </div>

          {/* Recently Visited Navigation History */}
          {!isAdmin && visitedHistory.filter(item => item !== activeTab).length > 0 && (
            <div id="breadcrumb-history" className="flex items-center space-x-2 text-[11px] flex-wrap gap-y-1">
              <span className="text-slate-400 dark:text-slate-550 font-mono text-[10px] uppercase tracking-wider select-none shrink-0">Recent:</span>
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                {visitedHistory
                  .filter(item => item !== activeTab)
                  .slice(0, 3)
                  .map((tabId) => {
                    const info = tabLabels[tabId];
                    if (!info) return null;
                    const Icon = info.icon;
                    return (
                      <button
                        key={tabId}
                        id={`breadcrumb-history-item-${tabId}`}
                        onClick={() => setActiveTab(tabId)}
                        className="flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-100 hover:bg-slate-200/85 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-all cursor-pointer font-medium border border-slate-200/50 dark:border-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 font-sans shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Icon className="w-3 h-3 shrink-0 text-slate-500" />
                        <span>{info.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

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

      {/* Toast Notification Container */}
      <div id="toast-notifications-container" className="fixed bottom-5 right-5 z-55 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            id={`toast-message-${toast.id}`}
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`pointer-events-auto flex items-start space-x-3 p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-500/90 dark:bg-emerald-950/90 text-white border-emerald-400/30 dark:border-emerald-500/30 shadow-emerald-500/10'
                : 'bg-rose-500/90 dark:bg-rose-950/90 text-white border-rose-400/30 dark:border-rose-500/30 shadow-rose-500/10'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-200 dark:text-emerald-405 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-200 dark:text-rose-405 mt-0.5" />
            )}
            
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[10px] font-sans tracking-wider uppercase text-white/80 select-none">
                {toast.type === 'success' ? 'Vault Transfer Success' : 'Vault Transfer Error'}
              </p>
              <p className="text-white text-xs mt-1 leading-relaxed break-words font-medium pr-1 select-none">
                {toast.message}
              </p>
            </div>
            
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-white/60 hover:text-white bg-transparent hover:bg-white/10 rounded-lg p-1 transition-colors duration-150 focus:outline-hidden cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </div>
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

