/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Shield, FolderKanban, LogOut, FileText, Settings, User } from 'lucide-react';
import { useAuth } from './AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  fileCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, fileCount }) => {
  const { user, logOut } = useAuth();
  const isAdmin = user?.uid === 'Od1XeGkGT2esKsPd6lJZ1x7KGzV2';

  return (
    <aside 
      id="app-sidebar"
      className="w-64 bg-[#0F172A] text-slate-100 flex flex-col justify-between border-r border-slate-800 shrink-0 z-30"
    >
      {/* Top Header */}
      <div className="flex flex-col">
        <div className="p-8 border-b border-slate-800 flex items-center space-x-3">
          <div className={`p-2 rounded-lg border ${
            isAdmin ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          }`}>
            <Shield className="w-6 h-6 shrink-0" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              {isAdmin ? 'AdminVault' : 'ClientVault'}
            </h1>
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
              {isAdmin ? 'Central Operations' : 'Secure File Portal'}
            </span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="p-4 space-y-1.5 flex-1">
          {isAdmin ? (
            <button
              id="nav-admin"
              onClick={() => setActiveTab('admin')}
              className="w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer bg-red-600/10 text-red-400 shadow-xs border-l-2 border-red-500"
            >
              <div className="flex items-center space-x-3 text-red-400">
                <Shield className="w-4 h-4 shrink-0 text-red-400" />
                <span className="font-bold">Admin Directory</span>
              </div>
            </button>
          ) : (
            <>
              <button
                id="nav-files"
                onClick={() => setActiveTab('files')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'files'
                    ? 'bg-blue-600/10 text-blue-400 shadow-xs border-l-2 border-blue-500'
                    : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <FolderKanban className="w-4 h-4 shrink-0" />
                  <span>All Client Files</span>
                </div>
                {fileCount > 0 && (
                  <span className="bg-blue-500/20 text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                    {fileCount}
                  </span>
                )}
              </button>

              <button
                id="nav-activity"
                onClick={() => setActiveTab('activity')}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'activity'
                    ? 'bg-blue-600/10 text-blue-400 shadow-xs border-l-2 border-blue-500'
                    : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Activity History</span>
                </div>
              </button>

              <button
                id="nav-settings"
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-blue-600/10 text-blue-400 shadow-xs border-l-2 border-blue-500'
                    : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Setup & Guidelines</span>
                </div>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-300">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate" title={user?.email || 'Active Client'}>
              {user?.email?.split('@')[0]}
            </p>
            <p className="text-[10px] text-slate-500 truncate" title={user?.email || ''}>
              {user?.email}
            </p>
          </div>
        </div>

        <button
          id="btn-sidebar-signout"
          onClick={() => logOut()}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-red-950/40 hover:bg-red-900/30 text-red-400 border border-red-900/40 hover:border-red-800/60 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
