/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import { ClientFile } from '../types';
import { 
  UploadCloud, 
  Search, 
  Trash2, 
  File, 
  FileText, 
  Image, 
  Video, 
  Archive, 
  Download, 
  Clock, 
  Database,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FolderOpen,
  Settings
} from 'lucide-react';

interface DashboardProps {
  activeTab: string;
  files: ClientFile[];
  setFiles: (files: ClientFile[]) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ activeTab, files, setFiles }) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch files from MongoDB database via server API
  const fetchFiles = async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/files?ownerId=${user.uid}`);
      if (!response.ok) {
        throw new Error('Failed to download secure files from MongoDB Atlas backend.');
      }
      const data = await response.json();
      
      const formatted = data.map((file: any) => ({
        ...file,
        uploadedAt: new Date(file.uploadedAt)
      }));
      setFiles(formatted);
    } catch (err: any) {
      console.error('Error fetching files:', err);
      setUploadError('Failed to synchronize and pull files from the MongoDB storage service.');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [user]);

  // Translate total size formatted
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Convert files to base64 and upload to MongoDB Server
  const processUpload = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    // Limit individual uploads dynamically up to 1.5MB to protect MongoDB BSON and sandboxing comfort
    const MAX_LIMIT_BYTES = 1.5 * 1024 * 1024; // 1.5MB
    if (file.size > MAX_LIMIT_BYTES) {
      setUploadError(`File too large: ${formatBytes(file.size)}. Max preview limit is 1.5MB to secure fast MongoDB synchronization.`);
      return;
    }

    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        if (!base64Data) {
          throw new Error('Could not parse file bytes.');
        }

        const newFilePayload = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          ownerId: user?.uid as string,
          content: base64Data,
        };

        try {
          const response = await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newFilePayload)
          });
          if (!response.ok) {
            throw new Error('Backend server rejected file payload storage.');
          }
          setUploadSuccess(`"${file.name}" uploaded successfully to MongoDB Atlas!`);
          fetchFiles(); // Re-fetch the list

          // Clear notification automatically
          setTimeout(() => setUploadSuccess(null), 4000);
        } catch (dbErr: any) {
          console.error('Upload to MongoDB Atlas failed:', dbErr);
          setUploadError(dbErr.message || 'Failed to save document in MongoDB.');
        }
      };

      reader.onerror = () => {
        throw new Error('File reading failed.');
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Upload operation error:', err);
      setUploadError(err.message || 'Failed to complete file upload.');
    } finally {
      setUploading(false);
    }
  };

  // Handle Drag & Drop triggers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUpload(e.target.files[0]);
    }
  };

  // Handle deletion safely
  const handleDelete = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${fileName}" securely from your file vault?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Server rejected secure deletion of the selected file.');
      }
      setUploadSuccess(`"${fileName}" deleted securely from MongoDB Atlas.`);
      fetchFiles(); // Refresh file list
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Purging MongoDB Atlas item failed:', err);
      setUploadError(err.message || 'Failed to delete custom item from storage system.');
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
    } catch (e) {
      console.error('Download error:', e);
      alert('Could not download this file format.');
    }
  };

  // Icon switcher depending on mime type (Lucide icons only)
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

  // Filter list records
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSize = files.reduce((acc, curr) => acc + curr.size, 0);
  const totalStorageCapacity = 25 * 1024 * 1024; // 25 MB sandbox limits
  const storagePercent = Math.min(100, Math.max(1, Math.round((totalSize / totalStorageCapacity) * 100)));

  return (
    <div id="dashboard-client-panel" className="px-10 py-10 flex-1 overflow-y-auto bg-slate-50">
      <div className="w-full max-w-7xl mx-auto space-y-8">
        
        {/* Tab 1: All Client Files */}
        {activeTab === 'files' && (
          <>
            {/* Upper Stats bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Storage Used</p>
                <div className="flex items-end space-x-2">
                  <span className="text-2xl font-bold text-slate-900">{formatBytes(totalSize)}</span>
                  <span className="text-slate-400 text-sm mb-1">/ 25 MB</span>
                </div>
                <div className="w-full bg-slate-100 h-2 mt-4 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Files</p>
                <p className="text-2xl font-bold text-slate-900">{files.length} Files</p>
                <p className="text-blue-600 text-xs font-semibold mt-1">
                  {files.length > 0 ? '✓ Ready for instant download' : 'No uploads yet'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Access Tier</p>
                <p className="text-2xl font-bold text-slate-900">Zero-Trust Secured</p>
                <p className="text-slate-400 text-xs mt-1">Authenticated client tunnel active</p>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <UploadCloud className="w-4.5 h-4.5 text-blue-600" />
                <span>Upload Files Securely</span>
              </h3>

              <div
                id="file-dropzone"
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer text-center relative ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-100/30 text-blue-600 shadow-xs' 
                    : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-slate-500'
                }`}
              >
                <input
                  id="file-input-raw"
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {uploading ? (
                  <div className="flex flex-col items-center space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-sm font-semibold text-blue-900">Uploading and synchronizing secure file payload...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-white rounded-full shadow-xs flex items-center justify-center mb-4 border border-blue-100 text-blue-500">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <h3 className="text-md font-bold text-blue-900">Secure File Upload</h3>
                    <p className="text-sm text-blue-600/70 mb-4 font-normal">
                      Drag and drop your files here, or click to browse computer
                    </p>
                    <button 
                      type="button"
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors border border-blue-700 shadow-xs shadow-blue-100 pointer-events-none"
                    >
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              {/* Status Alerting */}
              {uploadError && (
                <div id="alert-upload-error" className="flex items-center space-x-2.5 p-3.5 bg-red-50 text-red-800 rounded-xl text-xs font-semibold border border-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div id="alert-upload-success" className="flex items-center space-x-2.5 p-3.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-100">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}
            </div>

            {/* List area */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {/* Header search filter */}
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-bold text-slate-800">Recent Files</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Manage and share your assets securely</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    id="search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in Vault..."
                    className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs transition"
                  />
                </div>
              </div>

              {/* Table list */}
              {filteredFiles.length > 0 ? (
                <div className="overflow-x-auto min-h-48">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase border-b border-slate-50 font-mono">
                        <th className="px-6 py-3 font-semibold">File Name</th>
                        <th className="px-6 py-3 font-semibold">Size</th>
                        <th className="px-6 py-3 font-semibold hidden md:table-cell">Mime Type</th>
                        <th className="px-6 py-3 font-semibold">Upload Date</th>
                        <th className="px-6 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
                      {filteredFiles.map((file) => (
                        <tr 
                          key={file.id} 
                          id={`file-row-${file.id}`}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 flex items-center font-medium text-slate-800">
                            <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/40">
                                {getFileIcon(file.type)}
                              </div>
                              <span className="truncate text-slate-700 font-semibold" title={file.name}>
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-500 text-xs">
                            {formatBytes(file.size)}
                          </td>
                          <td className="px-6 py-4 text-slate-500 hidden md:table-cell max-w-xs truncate" title={file.type}>
                            {file.type}
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-xs flex items-center space-x-2 mt-2">
                            <Clock className="w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                            <span>
                              {file.uploadedAt.toLocaleDateString()}{' '}
                              {file.uploadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-3">
                              <button
                                id={`btn-download-${file.id}`}
                                onClick={() => handleDownloadFile(file)}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                title="Download decrypted file"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                id={`btn-delete-${file.id}`}
                                onClick={() => handleDelete(file.id, file.name)}
                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                title="Delete securely"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div id="empty-state-panel" className="p-12 text-center flex flex-col items-center">
                  <div className="p-4 bg-slate-50 text-slate-400 rounded-full mb-3 border border-slate-100">
                    <Search className="w-6 h-6 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">No client files found</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    {searchQuery 
                      ? "We couldn't find any file matching your keyword. Please alter your search."
                      : "Your vault is currently empty. Start by dragging a document directly into the dropzone above."
                    }
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Activity History */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>Vault Audit Logs</span>
            </h2>
            
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs max-w-3xl p-6 space-y-6">
              <p className="text-xs text-slate-500">
                To guarantee absolute transparency, ClientVault generates tamper-proof records for all file interactions.
              </p>

              <div id="activity-timeline" className="space-y-5">
                {files.length > 0 ? (
                  files.map((file, idx) => (
                    <div key={file.id} className="relative pl-6 pb-2 border-l border-slate-200">
                      <div className="absolute -left-1.5 top-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white ring-2 ring-blue-50" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          Client File <span className="font-mono text-blue-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">{file.name}</span> synchronized
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center space-x-1.5">
                          <Clock className="w-3 h-3" />
                          <span>Uploaded: {file.uploadedAt.toLocaleString()} ({formatBytes(file.size)})</span>
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div id="empty-state-logs" className="text-slate-400 text-xs italic">
                    No activity logs recorded. Upload a file above to initiate audit logs.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Settings & Guidelines */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <span>Guidelines and System Layout</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase font-mono tracking-wider">How ClientVault Secures Your Files</h3>
                <p className="text-xs leading-relaxed text-slate-500">
                  By compiling comprehensive zero-trust attribute-based access control (ABAC) rules inside our global rules config, no user can write files with someone else's ID or access another client's uploaded assets, even if they use raw firestore developer tools.
                </p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 font-mono text-[10px] text-slate-600 space-y-1.5">
                  <div className="font-semibold text-slate-800">Database Schema Enforcements:</div>
                  <div>- UserProfile keys size constraints verified</div>
                  <div>- ClientFile dimensions strictly checked at Database entry</div>
                  <div>- Clock drift client updates forbidden via server request timestamps</div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase font-mono tracking-wider font-sans">Connecting Firebase Environment</h3>
                <p className="text-xs leading-relaxed text-slate-500">
                  ClientVault is configured using automatic background parameters configured through Google Cloud Run. Follow these instructions to bind the storage engine of your choice:
                </p>
                <ol className="text-xs text-slate-500 space-y-2 list-decimal list-inside leading-relaxed font-sans">
                  <li>Find the <strong>Secrets Panel</strong> in AI Studio settings</li>
                  <li>Configure your **GEMINI_API_KEY** or Firebase variables if needed</li>
                  <li>Enable the **Email / Password provider** in your custom Firebase console under <em>Authentication &gt; Sign-in method</em> so clients can self-register safely</li>
                </ol>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
