/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import { ClientFile } from '../types';
import { 
  Users, 
  FileText, 
  Clock, 
  ShieldAlert, 
  Search, 
  Download, 
  Trash2, 
  ArrowLeft, 
  Database, 
  HardDrive, 
  Image, 
  Video, 
  Archive, 
  File, 
  Inbox, 
  Loader2,
  CheckCircle,
  X,
  Eye,
  Info,
  AlertTriangle
} from 'lucide-react';

interface FirestoreUser {
  id: string;
  email: string;
  name?: string;
  createdAt: Date | null;
}

interface MongoSummary {
  count: number;
  totalSize: number;
}

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [usersList, setUsersList] = useState<FirestoreUser[]>([]);
  const [mongoSummaries, setMongoSummaries] = useState<Record<string, MongoSummary>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Selected client drilldown state
  const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);
  const [selectedUserFiles, setSelectedUserFiles] = useState<ClientFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [filesSearchQuery, setFilesSearchQuery] = useState<string>('');
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<ClientFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);

  // Decodes textual base64 representations for beautiful in-app codeblock previews
  const getTextPreview = (content: string): string | null => {
    if (!content) return null;
    try {
      const parts = content.split(',');
      if (parts.length > 1 && parts[0].includes('text/')) {
        const decoded = atob(parts[1]);
        return decoded.length > 1500 ? decoded.substring(0, 1500) + '\n\n[Content truncated for performance...]' : decoded;
      }
    } catch (err) {
      console.warn('Could not decode file content preview:', err);
    }
    return null;
  };

  // Fetch Firestore users list and MongoDB stats
  const loadAdminMetrics = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch users from Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const loadedUsers: FirestoreUser[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let createdDate: Date | null = null;
        if (data.createdAt) {
          createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        }
        loadedUsers.push({
          id: docSnap.id,
          email: data.email || 'N/A',
          name: data.name,
          createdAt: createdDate,
        });
      });
      setUsersList(loadedUsers);

      // 2. Fetch aggregate stats from MongoDB
      const res = await fetch('/api/admin/files-summary');
      if (res.ok) {
        const summaries = await res.json();
        setMongoSummaries(summaries);
      } else {
        console.warn('Failed to fetch file summaries from metadata service.');
      }
    } catch (err: any) {
      console.error('Error in loadAdminMetrics:', err);
      // Log firestore error utilizing standard diagnostic format
      handleFirestoreError(err, OperationType.LIST, 'users');
      setErrorMsg('Failed to synchronize user directories in the admin space.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminMetrics();
  }, []);

  // Fetch documents for the selected client structure
  const handleInspectUser = async (targetUser: FirestoreUser) => {
    setSelectedUser(targetUser);
    setLoadingFiles(true);
    setFilesSearchQuery('');
    try {
      const res = await fetch(`/api/files?ownerId=${targetUser.id}`);
      if (!res.ok) {
        throw new Error('Could not pull secure documents for the specified client ID.');
      }
      const data = await res.json();
      const mapped = data.map((item: any) => ({
        ...item,
        uploadedAt: new Date(item.uploadedAt),
      }));
      setSelectedUserFiles(mapped);
    } catch (err: any) {
      console.error('Inspect files failed:', err);
      setErrorMsg(err.message || 'Unable to scan client vault repositories files.');
    } finally {
      setLoadingFiles(false);
    }
  };

  // Securely delete file on behalf of user
  const handleDeleteUserFile = (fileId: string, fileName: string) => {
    setFileToDelete({ id: fileId, name: fileName });
  };

  // Perform actual administrator purge of payload
  const executeDeleteUserFile = async () => {
    if (!fileToDelete) return;
    const { id: fileId, name: fileName } = fileToDelete;
    
    // Reset fileToDelete state first to gracefully dismiss confirmation modal
    setFileToDelete(null);

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to purge active payload from host environment.');
      }
      // Re-fetch files for the active inspected client
      if (selectedUser) {
        handleInspectUser(selectedUser);
        // Also refresh summaries asynchronously
        const resSum = await fetch('/api/admin/files-summary');
        if (resSum.ok) {
          const summaries = await resSum.json();
          setMongoSummaries(summaries);
        }
      }
    } catch (err: any) {
      console.error('Admin deletion failed:', err);
      alert(err.message || 'An error occurred during file purge.');
    }
  };

  // Trigger file download locally
  const handleDownloadFile = (file: ClientFile) => {
    try {
      const link = document.createElement('a');
      link.href = file.content;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Visual feedback via toast notification
      setDownloadSuccess(file.name);
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (e) {
      console.error('Download error:', e);
      alert('Could not download this file format.');
    }
  };

  // Byte Formatter
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Icon switcher depending on file type
  const getFileIcon = (mime: string) => {
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isPdf = mime.includes('pdf');
    const isDoc = mime.includes('document') || mime.includes('word') || mime.includes('text');
    const isArchive = mime.includes('zip') || mime.includes('tar') || mime.includes('compressed');

    if (isImage) return <Image className="w-5 h-5 text-emerald-500" />;
    if (isVideo) return <Video className="w-5 h-5 text-rose-500" />;
    if (isPdf) return <FileText className="w-5 h-5 text-red-500" />;
    if (isDoc) return <FileText className="w-5 h-5 text-blue-500" />;
    if (isArchive) return <Archive className="w-5 h-5 text-amber-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  // Filter Firestore users list
  const filteredUsers = usersList.filter((u) => {
    const queryStr = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(queryStr) || u.id.toLowerCase().includes(queryStr);
  });

  // Filter inspected files list
  const filteredInspectedFiles = selectedUserFiles.filter((f) => {
    return f.name.toLowerCase().includes(filesSearchQuery.toLowerCase());
  });

  // Calculate sum counts for overall stats
  const totalSystemFiles = (Object.values(mongoSummaries) as MongoSummary[]).reduce((acc, curr) => acc + curr.count, 0);
  const totalSystemStorage = (Object.values(mongoSummaries) as MongoSummary[]).reduce((acc, curr) => acc + curr.totalSize, 0);

  return (
    <div id="admin-view-panel" className="px-10 py-10 flex-1 overflow-y-auto bg-slate-50/50">
      <div className="w-full max-w-7xl mx-auto space-y-8">
        
        {/* Admin Warning Indicator Header */}
        <div className="bg-emerald-50/75 border border-emerald-200/80 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-200/50">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-emerald-600 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md font-sans">
                  Admin Authority
                </span>
                <span className="text-xs text-emerald-500 font-mono">Zero-Trust Directory Read Granted</span>
              </div>
              <h2 className="text-md font-bold text-emerald-900 mt-1">ClientVault Central Operations Hub</h2>
            </div>
          </div>
          <div className="text-xs text-emerald-700 bg-white border border-emerald-100 rounded-xl px-4 py-2 font-mono">
            Access ID: <span className="font-bold">{user?.uid}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Drilldown View or Principal Admin Dashboard */}
        {!selectedUser ? (
          <>
            {/* Upper Admin Stats Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Vault Users</p>
                  <p className="text-3xl font-extrabold text-slate-900">{usersList.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Synced Files</p>
                  <p className="text-3xl font-extrabold text-slate-900">{totalSystemFiles}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total System Storage</p>
                  <p className="text-3xl font-extrabold text-slate-900">{formatBytes(totalSystemStorage)}</p>
                </div>
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Users Directory Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800">Master Directory Services</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time inspection of encrypted tenant workspaces</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    id="user-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search client directory..."
                    className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 text-xs transition"
                  />
                </div>
              </div>

              {loading ? (
                <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-3" />
                  <p className="text-xs">Synchronizing active tenant listings...</p>
                </div>
              ) : filteredUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 font-mono">
                        <th className="px-6 py-3.5 font-semibold">Client Identity</th>
                        <th className="px-6 py-3.5 font-semibold">Registration Date</th>
                        <th className="px-6 py-3.5 font-semibold text-center">Files Synced</th>
                        <th className="px-6 py-3.5 font-semibold text-center">Work Space Size</th>
                        <th className="px-6 py-3.5 font-semibold text-right">Vault Audit</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const sumData = mongoSummaries[u.id] || { count: 0, totalSize: 0 };
                        return (
                          <tr 
                            key={u.id}
                            id={`user-row-${u.id}`}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-sm">{u.name || u.email.split('@')[0]}</span>
                                <span className="text-[11px] text-slate-500 font-sans">{u.email}</span>
                                <span className="text-[10px] text-slate-400 font-mono select-all">UID: {u.id}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-400">
                              {u.createdAt ? (
                                <div className="flex items-center space-x-1.5">
                                  <Clock className="w-3.5 h-3.5 text-slate-300" />
                                  <span>{u.createdAt.toLocaleDateString()} {u.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              ) : (
                                <span className="italic text-slate-300">Unspecified</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-block font-mono text-xs font-bold px-2 py-0.5 rounded ${
                                sumData.count > 0 ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-400 border border-slate-200/50'
                              }`}>
                                {sumData.count} Files
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-xs font-mono font-medium text-slate-500">
                              {formatBytes(sumData.totalSize)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                id={`btn-inspect-${u.id}`}
                                onClick={() => handleInspectUser(u)}
                                className="inline-flex items-center space-x-1 py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition font-semibold text-xs border border-slate-200/60 shadow-xs cursor-pointer"
                              >
                                <span>Inspect Vault</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-16 text-center flex flex-col items-center">
                  <Users className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No matching clients found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Please check other identity query criteria.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Client Specific WORKSPACE INSIGHT (Drilldown) */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                id="btn-admin-back"
                onClick={() => setSelectedUser(null)}
                className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-emerald-700 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Master Directory</span>
              </button>
              
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md">
                Active Tenant Audit Mode
              </span>
            </div>

            {/* Drilldown User Information Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
              <div>
                <span className="font-mono text-xs text-emerald-500 uppercase tracking-widest font-bold">Auditing Profile</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedUser.name || selectedUser.email}</h3>
                {selectedUser.name && (
                  <p className="text-xs text-slate-500 font-sans mt-0.5">{selectedUser.email}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  Secure Workspace ID: <span className="font-mono text-slate-500 select-all font-semibold">{selectedUser.id}</span>
                </p>
              </div>
              <div className="text-right sm:text-right text-xs text-slate-400 flex flex-col gap-1.5">
                <div className="font-medium bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                  Tenant registered: <span className="text-slate-700 font-bold">{selectedUser.createdAt ? selectedUser.createdAt.toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="font-medium bg-emerald-50/50 text-emerald-800 px-3 py-1 rounded-lg border border-emerald-100/50">
                  Assets located on: <span className="font-bold font-sans">MongoDB Atlas</span>
                </div>
              </div>
            </div>

            {/* User Synced Files Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h4 className="font-bold text-slate-800">Secure User Vault Assets</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Live file decryption, audit and purging controls</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-file-search-input"
                    type="text"
                    value={filesSearchQuery}
                    onChange={(e) => setFilesSearchQuery(e.target.value)}
                    placeholder="Search user files..."
                    className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 text-xs transition"
                  />
                </div>
              </div>

              {loadingFiles ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-3" />
                  <p className="text-xs">Decrypting secure document payload indexes...</p>
                </div>
              ) : filteredInspectedFiles.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase border-b border-slate-50 font-mono">
                        <th className="px-6 py-3 font-semibold">File Name</th>
                        <th className="px-6 py-3 font-semibold">Size</th>
                        <th className="px-6 py-3 font-semibold">Mime Type</th>
                        <th className="px-6 py-3 font-semibold">Upload Info</th>
                        <th className="px-6 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
                      {filteredInspectedFiles.map((file) => (
                        <tr 
                          key={file.id} 
                          id={`admin-file-row-${file.id}`}
                          className="hover:bg-slate-100/70 transition-colors cursor-pointer group"
                          onClick={() => setSelectedPreviewFile(file)}
                          title="Click to preview file details"
                        >
                          <td className="px-6 py-4 flex items-center font-medium text-slate-800">
                            <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/40 group-hover:bg-white group-hover:border-emerald-200/80 transition">
                                {getFileIcon(file.type)}
                              </div>
                              <span className="truncate text-slate-700 font-bold group-hover:text-emerald-700 transition" title={file.name}>
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-500 text-xs">
                            {formatBytes(file.size)}
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-xs truncate max-w-[124px]" title={file.type}>
                            {file.type}
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-xs">
                            <div className="flex items-center space-x-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              <span>{file.uploadedAt.toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                id={`btn-admin-download-${file.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(file);
                                }}
                                className="text-slate-400 hover:text-blue-600 transition p-1 cursor-pointer"
                                title="Download decrypted payload"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                id={`btn-admin-delete-${file.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteUserFile(file.id, file.name);
                                }}
                                className="text-slate-300 hover:text-emerald-500 transition p-1 cursor-pointer"
                                title="Purge document"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-16 text-center flex flex-col items-center">
                  <Inbox className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No vault files found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    {filesSearchQuery 
                      ? "The workspace contains no matches for this search query." 
                      : "This tenant's encrypted workspace folder has no uploads recorded."
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Floating Animated Download Confirmation Toast */}
      <AnimatePresence>
        {downloadSuccess && (
          <motion.div
            id="admin-download-toast"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[9999] flex items-center space-x-3.5 bg-slate-900 text-white border border-slate-800 rounded-2xl px-5 py-4 shadow-2xl max-w-sm"
          >
            <div className="w-9 h-9 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h5 className="text-xs font-bold text-slate-200">Download Complete</h5>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={downloadSuccess}>
                {downloadSuccess} downloaded successfully
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Visual Preview Modal */}
      <AnimatePresence>
        {selectedPreviewFile && (
          <div 
            id="admin-preview-modal-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSelectedPreviewFile(null)}
          >
            <motion.div
              id="admin-preview-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-[70vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left Side: Visual Interactive Preview Stage */}
              <div className="flex-1 bg-slate-950 flex flex-col relative group select-none min-h-[300px] md:min-h-0">
                {/* Stage Backdrop info overlay */}
                <span className="absolute top-4 left-4 bg-emerald-600/95 backdrop-blur-md text-[10px] font-mono tracking-widest text-white font-bold px-2.5 py-1 rounded-md z-1 flex items-center space-x-1.5 shadow-md">
                  <ShieldAlert className="w-3 h-3" />
                  <span>ADMIN PREVIEW CONSOLE</span>
                </span>

                <button
                  id="admin-preview-close-corner-btn"
                  onClick={() => setSelectedPreviewFile(null)}
                  className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white hover:text-emerald-400 transition p-1.5 rounded-full z-1 cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                  {selectedPreviewFile.type.startsWith('image/') ? (
                    <img 
                      src={selectedPreviewFile.content || undefined} 
                      alt={selectedPreviewFile.name} 
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain rounded-lg shadow-xl border border-slate-800"
                    />
                  ) : selectedPreviewFile.type.startsWith('video/') ? (
                    <video 
                      src={selectedPreviewFile.content || undefined} 
                      controls 
                      className="max-w-full max-h-full rounded-lg shadow-xl border border-slate-800"
                    />
                  ) : getTextPreview(selectedPreviewFile.content) ? (
                    <div className="w-full h-full text-left bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-auto font-mono text-xs text-emerald-400/90 leading-relaxed selection:bg-emerald-500/25 selection:text-white">
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/60 sticky top-0 bg-slate-900 z-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        <span>Decrypted File Stream</span>
                        <span>UT8 Raw Text</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono font-medium">{getTextPreview(selectedPreviewFile.content)}</pre>
                    </div>
                  ) : (
                    /* Default Icon stage for archives/other secure blobs */
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-4">
                      <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-center text-slate-300 shadow-inner">
                        {getFileIcon(selectedPreviewFile.type)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-200">No Render Output</p>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-xs font-sans">
                          A direct thumbnail is unavailable for this content type. Use the buttons to inspect and download.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Operations Control Panel & Metadata Sidebar */}
              <div className="w-full md:w-[320px] bg-slate-50/50 border-t md:border-t-0 md:border-l border-slate-200 p-6 flex flex-col justify-between overflow-y-auto font-sans">
                <div className="space-y-6 animate-fadeIn pb-4">
                  {/* File Profile */}
                  <div>
                    <h4 className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-widest">Client Identity Vault File</h4>
                    <h3 className="text-md font-extrabold text-slate-900 mt-1 break-words font-sans mb-1" title={selectedPreviewFile.name}>
                      {selectedPreviewFile.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 items-center mt-2">
                      <span className="bg-slate-200/60 text-slate-700 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold">
                        {formatBytes(selectedPreviewFile.size)}
                      </span>
                      <span className="bg-emerald-50 text-emerald-750 text-[10px] border border-emerald-100 px-2 py-0.5 rounded-md font-mono truncate" title={selectedPreviewFile.type}>
                        {selectedPreviewFile.type.split('/')[1] || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <hr className="border-slate-200/80" />

                  {/* Vault Diagnostics Metadata List */}
                  <div className="space-y-4 font-sans text-xs">
                    <h5 className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Info className="w-4 h-4 text-slate-400" />
                      <span>Audit & Ownership ID</span>
                    </h5>
                    
                    <div className="space-y-3 font-medium text-slate-600">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Owner ID (Client)</p>
                        <p className="text-slate-700 font-mono text-[10px] bg-slate-100 p-1.5 rounded-md mt-1 break-all select-all font-mono">{selectedPreviewFile.ownerId}</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Document System ID</p>
                        <p className="text-slate-700 font-mono text-[10px] bg-slate-100 p-1.5 rounded-md mt-1 break-all select-all font-mono">{selectedPreviewFile.id}</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Creation Timestamp</p>
                        <p className="text-slate-850 mt-0.5">
                          {selectedPreviewFile.uploadedAt.toLocaleDateString()} {selectedPreviewFile.uploadedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations Actions */}
                <div className="space-y-2 mt-8 md:mt-0 pt-4 border-t border-slate-200 border-dashed">
                  <button
                    id="admin-modal-preview-btn-download"
                    onClick={() => handleDownloadFile(selectedPreviewFile)}
                    className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs border border-blue-700 shadow-md shadow-blue-100 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Payload</span>
                  </button>
                  <button
                    id="admin-modal-preview-btn-delete"
                    onClick={() => {
                      handleDeleteUserFile(selectedPreviewFile.id, selectedPreviewFile.name);
                      setSelectedPreviewFile(null);
                    }}
                    className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-semibold text-xs border border-slate-200 hover:border-emerald-200 transition cursor-pointer"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                    <span>Purge from Vault</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Custom Modal Confirmation Dialog for File Deletion */}
      <AnimatePresence>
        {fileToDelete && (
          <div 
            id="admin-delete-confirm-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setFileToDelete(null)}
          >
            <motion.div
              id="admin-delete-confirm-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-sm overflow-hidden p-6 relative font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                {/* Warning Badge with Admin Flag */}
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl flex items-center justify-center mb-4 relative">
                  <AlertTriangle className="w-7 h-7" />
                  <span className="absolute -top-1 -right-1 bg-emerald-600 text-[8px] font-extrabold text-white px-1.5 py-0.5 rounded-full uppercase border-2 border-white scale-90">
                    ADMIN
                  </span>
                </div>

                <h3 className="text-base font-extrabold text-slate-950 tracking-tight">
                  Disposal Overrides Active
                </h3>
                
                <p className="text-xs text-slate-550 font-medium mt-2 leading-relaxed px-1">
                  Are you absolutely sure you want to permanently delete <span className="font-bold text-slate-800 break-all">"{fileToDelete.name}"</span> on behalf of this client?
                </p>

                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 mt-4 text-left w-full flex items-start space-x-2.5">
                  <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-emerald-800 font-medium leading-relaxed">
                    This administrative action is final and will completely purge the client's original file stream and records from the MongoDB database system.
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  id="admin-btn-confirm-delete-cancel"
                  onClick={() => setFileToDelete(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-150 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200 cursor-pointer"
                >
                  Keep Payload
                </button>
                <button
                  id="admin-btn-confirm-delete-execute"
                  onClick={executeDeleteUserFile}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-100 transition border border-emerald-700 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge Document</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
