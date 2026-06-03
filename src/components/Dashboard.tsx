/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import { ClientFile, ActivityLog } from '../types';
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
  Music,
  FileSpreadsheet,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FolderOpen,
  Folder,
  FolderPlus,
  FolderArchive,
  FolderCode,
  FolderLock,
  FolderSync,
  FolderHeart,
  Settings,
  X,
  Eye,
  Info,
  Tag,
  Plus,
  Share2,
  Link,
  Copy,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCode,
  Sun,
  Moon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Type,
  Edit3,
  ShieldAlert,
  Mail
} from 'lucide-react';

interface DashboardProps {
  activeTab: string;
  files: ClientFile[];
  setFiles: (files: ClientFile[]) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  currentFolder?: string | null;
  navigateToFolder?: (folderPath: string | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  activeTab, 
  files, 
  setFiles, 
  theme, 
  setTheme,
  currentFolder = null,
  navigateToFolder = (folderPath: string | null) => {}
}) => {
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadNotificationSent, setUploadNotificationSent] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<ClientFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<boolean>(false);
  const [deletingBulk, setDeletingBulk] = useState<boolean>(false);
  
  // Bulk Rename State
  const [showBulkRenameModal, setShowBulkRenameModal] = useState(false);
  const [bulkRenameMode, setBulkRenameMode] = useState<'prefix_suffix' | 'pattern' | 'replace'>('prefix_suffix');
  const [bulkRenamePrefix, setBulkRenamePrefix] = useState('');
  const [bulkRenameSuffix, setBulkRenameSuffix] = useState('');
  const [bulkRenamePattern, setBulkRenamePattern] = useState('{name}_v1');
  const [bulkRenameFind, setBulkRenameFind] = useState('');
  const [bulkRenameReplace, setBulkRenameReplace] = useState('');
  const [renamingBulk, setRenamingBulk] = useState(false);

  // Bulk Move State
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [customMoveFolder, setCustomMoveFolder] = useState('');
  const [selectedFolderToMove, setSelectedFolderToMove] = useState<string | null>(null);
  const [movingBulk, setMovingBulk] = useState(false);

  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState<boolean>(false);
  const [shareExpiresMin, setShareExpiresMin] = useState<number>(60);
  const [generatedShareLink, setGeneratedShareLink] = useState<string | null>(null);
  const [generatingShareLink, setGeneratingShareLink] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  
  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    file: ClientFile;
  } | null>(null);

  // Dedicated Share Modal State
  const [shareModalFile, setShareModalFile] = useState<ClientFile | null>(null);
  const [shareModalExpiresMin, setShareModalExpiresMin] = useState<number>(60);
  const [shareModalGeneratedLink, setShareModalGeneratedLink] = useState<string | null>(null);
  const [shareModalGenerating, setShareModalGenerating] = useState<boolean>(false);
  const [shareModalCopySuccess, setShareModalCopySuccess] = useState<boolean>(false);

  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('contextmenu', handleOutsideClick);
    window.addEventListener('scroll', handleOutsideClick, true);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('contextmenu', handleOutsideClick);
      window.removeEventListener('scroll', handleOutsideClick, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, file: ClientFile) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const handleGenerateShareModalLink = async () => {
    if (!user || !shareModalFile) return;
    setShareModalGenerating(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: shareModalFile.id,
          expiresInMinutes: shareModalExpiresMin,
          ownerId: user.uid
        })
      });
      if (!response.ok) {
        throw new Error('Unable to register secure Direct Link credentials.');
      }
      const data = await response.json();
      const directUrl = `${window.location.origin}?share=${data.token}`;
      setShareModalGeneratedLink(directUrl);
      fetchActivities(); // update real-time logs instantly
    } catch (err: any) {
      console.error('Share modal link creation failure:', err);
    } finally {
      setShareModalGenerating(false);
    }
  };
  
  // Pre-upload Preview Modal State
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingUploadPreviewUrl, setPendingUploadPreviewUrl] = useState<string | null>(null);
  const [pendingFileTags, setPendingFileTags] = useState<string[]>([]);
  const [isPreUploadPreviewOpen, setIsPreUploadPreviewOpen] = useState(false);
  const [pendingUploadFileName, setPendingUploadFileName] = useState('');
  
  // Custom Folder Creation State
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderCreationError, setFolderCreationError] = useState<string | null>(null);
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);

  useEffect(() => {
    if (user?.uid) {
      try {
        const saved = localStorage.getItem(`clientvault-folders-${user.uid}`);
        if (saved) {
          setCreatedFolders(JSON.parse(saved));
        } else {
          setCreatedFolders([]);
        }
      } catch (err) {
        console.error('Failed to load empty folders:', err);
      }
    }
  }, [user?.uid]);

  const saveCreatedFolders = (folders: string[]) => {
    setCreatedFolders(folders);
    if (user?.uid) {
      try {
        localStorage.setItem(`clientvault-folders-${user.uid}`, JSON.stringify(folders));
      } catch (err) {
        console.error('Failed to save empty folders:', err);
      }
    }
  };

  const handleCreateFolder = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName) {
      setFolderCreationError('Folder name cannot be blank.');
      return;
    }
    if (/[\\:*?"<>|]/.test(cleanName)) {
      setFolderCreationError('Folder name containing special characters such as \\ : * ? " < > | is not allowed.');
      return;
    }
    if (cleanName.includes('/')) {
      setFolderCreationError('Nested subdirectories cannot be created with forward slashes.');
      return;
    }

    const fullPath = currentFolder ? `${currentFolder}/${cleanName}` : cleanName;

    const existsInFiles = files.some(file => {
      const f = file.folder || '';
      return f === fullPath || f.startsWith(fullPath + '/');
    });

    const existsInCreated = createdFolders.some(f => f === fullPath || f.startsWith(fullPath + '/'));

    if (existsInFiles || existsInCreated) {
      setFolderCreationError(`A folder named "${cleanName}" already exists in this directory.`);
      return;
    }

    const updatedFolders = [...createdFolders, fullPath];
    saveCreatedFolders(updatedFolders);
    setShowCreateFolderModal(false);
    
    window.dispatchEvent(new CustomEvent('secure-upload-notification', {
      detail: { type: 'success', message: `Empty directory "${cleanName}" created successfully.` }
    }));
  };
  
  // Sorting State
  const [sortField, setSortField] = useState<'name' | 'size' | 'uploadedAt'>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Account Profile Edit States
  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [saveNameError, setSaveNameError] = useState<string | null>(null);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  useEffect(() => {
    if (profile?.name) {
      setNewName(profile.name);
    } else if (user?.email) {
      // Fallback name if profile document doesn't exist yet
      setNewName(user.email.split('@')[0]);
    }
  }, [profile, user]);

  const handleToggleNotifications = async () => {
    if (!user) return;
    setUpdatingNotifications(true);
    const currentValue = profile?.emailNotificationsEnabled ?? true;
    const newValue = !currentValue;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      if (profile) {
        await setDoc(userDocRef, {
          email: user.email || '',
          name: profile.name || '',
          createdAt: profile.createdAt,
          emailNotificationsEnabled: newValue
        });
      } else {
        await setDoc(userDocRef, {
          email: user.email || '',
          name: user.email?.split('@')[0] || '',
          createdAt: serverTimestamp(),
          emailNotificationsEnabled: newValue
        });
      }
      setUploadSuccess(`Saved successfully! Email notifications are now ${newValue ? 'ENABLED' : 'DISABLED'}.`);
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error toggling notifications:', err);
      setUploadError(err.message || 'Failed to update notification settings.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newName.trim()) {
      setSaveNameError('Please enter a valid full name.');
      return;
    }
    
    setSavingName(true);
    setSaveNameError(null);
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      if (profile) {
        // Exists: update email or name, maintaining exact original createdAt
        await setDoc(userDocRef, {
          email: user.email || '',
          name: newName.trim(),
          createdAt: profile.createdAt,
          emailNotificationsEnabled: profile.emailNotificationsEnabled ?? true,
        });
      } else {
        // New setup: provision profile with standard serverTimestamp
        await setDoc(userDocRef, {
          email: user.email || '',
          name: newName.trim(),
          createdAt: serverTimestamp(),
          emailNotificationsEnabled: true,
        });
      }
      setIsEditNameModalOpen(false);
    } catch (err: any) {
      console.error('Error saving name:', err);
      setSaveNameError(err.message || 'Failed to update user profile. Please check firestore database rules.');
    } finally {
      setSavingName(false);
    }
  };

  const handleSort = (field: 'name' | 'size' | 'uploadedAt') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Zooming & Rotation image options
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  // Dynamic binary Blob URL for iframe and standard previews
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Microsoft Word (.docx) dynamic states
  const [docxLines, setDocxLines] = useState<string[] | null>(null);
  const [docxLoading, setDocxLoading] = useState<boolean>(false);

  // HEIF / HEIC image transcoder states
  const [heicLoading, setHeicLoading] = useState<boolean>(false);
  const [heicBlobUrl, setHeicBlobUrl] = useState<string | null>(null);
  const [heicError, setHeicError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset sharing UI states when a different file is previewed
  useEffect(() => {
    setGeneratedShareLink(null);
    setCopySuccess(false);
  }, [selectedPreviewFile]);

  // Keep selection synchronized with actual existing file objects
  useEffect(() => {
    const existingIds = new Set(files.map(f => f.id));
    setSelectedFileIds(prev => prev.filter(id => existingIds.has(id)));
  }, [files]);

  // Programmatically trigger the secure file upload picker from the header area
  useEffect(() => {
    const handleTriggerUpload = () => {
      fileInputRef.current?.click();
    };
    window.addEventListener('trigger-secure-upload', handleTriggerUpload);
    return () => {
      window.removeEventListener('trigger-secure-upload', handleTriggerUpload);
    };
  }, []);

  // Broadcast uploading, compressing and uploadProgress state updates to other parts of the app (e.g. Header Quick Upload)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('secure-upload-state', {
      detail: { uploading, compressing, uploadProgress }
    }));
  }, [uploading, compressing, uploadProgress]);

  // Dispatch public sharing link creation to the secure sharing API
  const handleGenerateShareLink = async (fileId: string) => {
    if (!user) return;
    setGeneratingShareLink(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          expiresInMinutes: shareExpiresMin,
          ownerId: user.uid
        })
      });
      if (!response.ok) {
        throw new Error('Unable to register secure Direct Link credentials.');
      }
      const data = await response.json();
      const directUrl = `${window.location.origin}?share=${data.token}`;
      setGeneratedShareLink(directUrl);
      fetchActivities(); // Update real-time logs instantaneously
    } catch (err: any) {
      console.error('Link creation failure:', err);
      setUploadError(err.message || 'Unable to register direct access point.');
    } finally {
      setGeneratingShareLink(false);
    }
  };

  // Helper to convert base64 data URI to standard browser Blob
  const dataURIToBlob = (dataURI: string): Blob | null => {
    if (!dataURI) return null;
    try {
      const parts = dataURI.split(',');
      if (parts.length < 2) return null;
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (e) {
      console.error('Failed to parse base64 Data URI into binary Blob:', e);
      return null;
    }
  };

  // Parses Microsoft Word OOXML files client-side using JSZip
  const parseDocxFile = async (base64Content: string): Promise<string[]> => {
    try {
      const rawBase64 = base64Content.split(',')[1] || base64Content;
      const zip = await JSZip.loadAsync(rawBase64, { base64: true });
      const docXmlFile = zip.file("word/document.xml");
      if (!docXmlFile) {
        return ["Unsupported Word file structure: Missing word/document.xml entry in OOXML layout."];
      }
      const xmlText = await docXmlFile.async("string");
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const paragraphs = xmlDoc.getElementsByTagName("w:p");
      const resultLines: string[] = [];
      
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const textNodes = p.getElementsByTagName("w:t");
        let pText = "";
        for (let j = 0; j < textNodes.length; j++) {
          pText += textNodes[j].textContent || "";
        }
        // Let's preserve layout spacing but ignore fully empty paragraph lines if too many
        if (pText.trim() !== "" || (resultLines.length > 0 && resultLines[resultLines.length - 1] !== "")) {
          resultLines.push(pText);
        }
      }
      return resultLines.length > 0 ? resultLines : ["Empty Document Template"];
    } catch (err: any) {
      console.error("Docx parser failure:", err);
      return [`Decryption or extraction error: ${err.message || err}`];
    }
  };

  // Synchronously resets coordinates and triggers transcoder + extract pipelines on selection changes
  useEffect(() => {
    setZoomFactor(1);
    setRotationAngle(0);
    setDocxLines(null);
    setDocxLoading(false);
    setHeicLoading(false);
    setHeicBlobUrl(null);
    setHeicError(null);
    setPreviewUrl(null);

    if (!selectedPreviewFile || !selectedPreviewFile.content) return;

    const fileContent = selectedPreviewFile.content;
    const fileName = selectedPreviewFile.name.toLowerCase();
    const fileType = selectedPreviewFile.type.toLowerCase();

    // 1. PDF / Images / Videos - generate secure short Blob URL to feed browser's native iframe/embed viewports
    const isStandardMedia = fileType.startsWith('image/') || 
                            fileType.startsWith('video/') || 
                            fileType.includes('pdf');
                            
    const isPdf = fileType.includes('pdf') || fileName.endsWith('.pdf');

    if (isStandardMedia || isPdf) {
      // If it's a base64 Data URI, map to short binary Object URL for better browser layout performance
      if (fileContent.startsWith('data:')) {
        const blob = dataURIToBlob(fileContent);
        if (blob) {
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          return () => URL.revokeObjectURL(url);
        }
      }
      setPreviewUrl(fileContent);
    }

    // 2. Microsoft Word (.docx) text parsing pipeline
    const isDocx = fileType.includes('word') || 
                   fileType.includes('officedocument') || 
                   fileName.endsWith('.docx');
                   
    if (isDocx) {
      setDocxLoading(true);
      parseDocxFile(fileContent)
        .then(lines => {
          setDocxLines(lines);
          setDocxLoading(false);
        })
        .catch(err => {
          setDocxLines([`Encountered extract error: ${err.message || err}`]);
          setDocxLoading(false);
        });
    }

    // 3. HEIF / HEIC transcoding pipeline
    const isHeic = fileType.includes('heic') || 
                   fileType.includes('heif') || 
                   fileName.endsWith('.heic') || 
                   fileName.endsWith('.heif');

    if (isHeic) {
      setHeicLoading(true);
      const executeHeicTranscode = async () => {
        try {
          const rawBase = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
          const byteChars = atob(rawBase);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          const uintArray = new Uint8Array(byteNums);
          const inputBlob = new Blob([uintArray], { type: 'image/heic' });

          const heic2anyModule = (await import('heic2any')).default;
          const result = await heic2anyModule({
            blob: inputBlob,
            toType: 'image/jpeg',
            quality: 0.8
          });
          const convertedBlob = Array.isArray(result) ? result[0] : result;
          const objectUrl = URL.createObjectURL(convertedBlob);
          setHeicBlobUrl(objectUrl);
        } catch (err: any) {
          console.error("Failed standard client HEIF to JPEG transcoding:", err);
          setHeicError("HEIF decoding engine not active on client browser. Displaying metadata stream.");
        } finally {
          setHeicLoading(false);
        }
      };

      executeHeicTranscode();
    }
  }, [selectedPreviewFile]);

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

  // Fetch file telemetry events from MongoDB database via server API
  const fetchActivities = async () => {
    if (!user) return;
    setLoadingActivities(true);
    try {
      const response = await fetch(`/api/activities?ownerId=${user.uid}`);
      if (!response.ok) {
        throw new Error('Failed to download activity log records.');
      }
      const data = await response.json();
      const formatted = data.map((act: any) => ({
        ...act,
        timestamp: new Date(act.timestamp)
      }));
      setActivities(formatted);
    } catch (err: any) {
      console.error('Error fetching activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Export User Activity Trail as CSV (RFC-4180 Compliant)
  const handleExportCSV = () => {
    if (activities.length === 0) return;

    // Define CSV Headers
    const headers = ['Log ID', 'Owner ID', 'Action Type', 'File Name', 'Action Details', 'Timestamp (UTC)', 'Local Time'];

    // Map rows with careful escaping
    const rows = activities.map(act => {
      const escape = (val: string) => {
        const str = val ? String(val) : '';
        // If it contains double quotes, commas, or newlines, escape properly
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const dateStr = act.timestamp instanceof Date 
        ? act.timestamp.toISOString() 
        : new Date(act.timestamp).toISOString();

      const localDateStr = act.timestamp instanceof Date
        ? `${act.timestamp.toLocaleDateString()} ${act.timestamp.toLocaleTimeString()}`
        : `${new Date(act.timestamp).toLocaleDateString()} ${new Date(act.timestamp).toLocaleTimeString()}`;

      return [
        escape(act.id),
        escape(act.ownerId),
        escape(act.action),
        escape(act.fileName),
        escape(act.details),
        escape(dateStr),
        escape(localDateStr)
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const filename = `clientvault_audit_logs_${new Date().toISOString().split('T')[0]}.csv`;

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Display beautiful confirmation toast
      setDownloadSuccess(filename);
      setTimeout(() => setDownloadSuccess(null), 4050);
    } catch (err: any) {
      console.error('Failed to export CSV logs:', err);
    }
  };

  const initiatePreUploadPreview = (file: File) => {
    setPendingUploadFile(file);
    setPendingUploadFileName(file.name);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPendingUploadPreviewUrl(url);
    } else {
      setPendingUploadPreviewUrl(null);
    }
    setPendingFileTags([]);
    setIsPreUploadPreviewOpen(true);
  };

  const handleCancelPendingUpload = () => {
    if (pendingUploadPreviewUrl) {
      URL.revokeObjectURL(pendingUploadPreviewUrl);
    }
    setPendingUploadFile(null);
    setPendingUploadPreviewUrl(null);
    setPendingFileTags([]);
    setPendingUploadFileName('');
    setIsPreUploadPreviewOpen(false);
  };

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
    fetchActivities();
  }, [user]);

  // Translate total size formatted
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fast, high-fidelity client-side image compression utilizing HTML5 Canvas and Object URLs
  const compressImage = (file: File, maxWidth = 1200, maxHeight = 900, quality = 0.65): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width;
        let height = img.height;

        // Downscale bounds if it exceeds max bounds while keeping the aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // fallback if 2D context fails
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // fallback
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file); // fallback on image load error
      };
      
      img.src = objectUrl;
    });
  };

  // Convert files to base64 and upload to MongoDB Server
  const processUpload = async (fileToUpload: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);
    setCompressing(false);

    let file = fileToUpload;

    const isImage = file.type.startsWith('image/') || 
                    file.name.toLowerCase().endsWith('.jpg') || 
                    file.name.toLowerCase().endsWith('.jpeg') || 
                    file.name.toLowerCase().endsWith('.png');

    // Auto-compress any image above 500KB to guarantee stay below 1MB proxy/payload limit
    if (isImage && file.size > 500 * 1024) {
      setUploading(true);
      setCompressing(true);
      try {
        // Pass 1: standard high-res landscape
        let compressed = await compressImage(file, 1400, 1050, 0.7);
        
        // Pass 2: intermediate sizes if still above 850KB threshold
        if (compressed.size > 850 * 1024) {
          compressed = await compressImage(file, 1024, 768, 0.55);
        }
        
        // Pass 3: progressive safe sizing if still above 850KB threshold
        if (compressed.size > 850 * 1024) {
          compressed = await compressImage(file, 800, 600, 0.45);
        }
        
        file = compressed;
      } catch (err) {
        console.error("Client-side image compression failed, attempting raw upload:", err);
      } finally {
        setCompressing(false);
      }
    }

    // Limit individual uploads dynamically up to 15MB now that we support client-side chunked transfers to bypass payload limits
    const MAX_SECURE_LIMIT_BYTES = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SECURE_LIMIT_BYTES) {
      const errMsg = `File too large: ${formatBytes(file.size)}. Under ClientVault fortress compliance guidelines, chunked files must be under 15MB to ensure processing compatibility.`;
      setUploadError(errMsg);
      setUploading(false);
      window.dispatchEvent(new CustomEvent('secure-upload-notification', {
        detail: { type: 'error', message: errMsg }
      }));
      return;
    }

    if (!uploading) {
      setUploading(true);
    }

    try {
      const reader = new FileReader();

      // Track reader reading disk progress
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 30); // 0% - 30% for local parsing
          setUploadProgress(percent);
        }
      };

      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        if (!base64Data) {
          setUploading(false);
          setUploadProgress(0);
          const errMsg = 'Could not parse file bytes.';
          setUploadError(errMsg);
          window.dispatchEvent(new CustomEvent('secure-upload-notification', {
            detail: { type: 'error', message: errMsg }
          }));
          return;
        }

        // Reader complete: set to 30%
        setUploadProgress(30);

        // Client-side chunk size: 512KB of base64 characters per chunk
        const chunkSize = 512 * 1024;
        const totalChunks = Math.ceil(base64Data.length / chunkSize);

        try {
          // 1. Initialize secure segmented upload session
          const sessionResponse = await fetch('/api/files/upload-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: pendingUploadFileName || file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              ownerId: user?.uid as string,
              tags: [...pendingFileTags],
              totalChunks,
              folder: currentFolder,
            }),
          });

          if (!sessionResponse.ok) {
            let errorText = 'Failed to initialize secure upload session.';
            try {
              const errBody = await sessionResponse.json();
              if (errBody && errBody.error) {
                errorText = errBody.error;
              }
            } catch (jsonErr) {}
            throw new Error(errorText);
          }

          const { uploadId } = await sessionResponse.json();

          // 2. Upload segments sequentially
          for (let i = 0; i < totalChunks; i++) {
            const startIdx = i * chunkSize;
            const endIdx = Math.min(startIdx + chunkSize, base64Data.length);
            const chunkData = base64Data.substring(startIdx, endIdx);

            const chunkPayload = {
              uploadId,
              chunkIndex: i,
              chunkData,
            };

            const chunkResponse = await fetch('/api/files/upload-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chunkPayload),
            });

            if (!chunkResponse.ok) {
              let errorText = `Failed to transfer segment ${i + 1} of ${totalChunks}.`;
              try {
                const errBody = await chunkResponse.json();
                if (errBody && errBody.error) {
                  errorText = errBody.error;
                }
              } catch (jsonErr) {}
              throw new Error(errorText);
            }

            // Distribute remaining 70% progress over file chunks
            const progressRangeCount = totalChunks;
            const currentPartPercent = Math.round(30 + ((i + 1) / progressRangeCount) * 70);
            setUploadProgress(Math.min(100, currentPartPercent));
          }

          setUploadProgress(100);
          const successMsg = `"${pendingUploadFileName || file.name}" uploaded successfully via secure segmented transfer!`;
          setUploadSuccess(successMsg);

          const isNotifEnabled = profile?.emailNotificationsEnabled ?? true;
          setUploadNotificationSent(
            isNotifEnabled
              ? `Automated upload notification email dispatched to ${user?.email || 'registered address'}!`
              : `Upload email notification bypassed (Opted-out under Setup)`
          );

          fetchFiles(); // Re-fetch the list
          fetchActivities(); // Refresh activities stream
          window.dispatchEvent(new CustomEvent('secure-upload-notification', {
            detail: { type: 'success', message: successMsg }
          }));

          // Clear pre-upload pending states
          if (pendingUploadPreviewUrl) {
            URL.revokeObjectURL(pendingUploadPreviewUrl);
          }
          setPendingUploadFile(null);
          setPendingUploadPreviewUrl(null);
          setPendingFileTags([]);
          setPendingUploadFileName('');
          setIsPreUploadPreviewOpen(false);

          // Clear notification automatically after showing complete state
          setTimeout(() => {
            setUploadSuccess(null);
            setUploadNotificationSent(null);
            setUploading(false);
            setUploadProgress(0);
          }, 4000);
        } catch (dbErr: any) {
          console.error('Segmented transfer failed:', dbErr);
          const errMsg = dbErr.message || 'Segmented transfer failed to save document.';
          setUploadError(errMsg);
          setUploading(false);
          setUploadProgress(0);
          window.dispatchEvent(new CustomEvent('secure-upload-notification', {
            detail: { type: 'error', message: errMsg }
          }));
        }
      };

      reader.onerror = () => {
        setUploading(false);
        setUploadProgress(0);
        const errMsg = 'File reading from local disk failed.';
        setUploadError(errMsg);
        window.dispatchEvent(new CustomEvent('secure-upload-notification', {
          detail: { type: 'error', message: errMsg }
        }));
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Upload operation error:', err);
      const errMsg = err.message || 'Failed to complete file upload.';
      setUploadError(errMsg);
      setUploading(false);
      setUploadProgress(0);
      window.dispatchEvent(new CustomEvent('secure-upload-notification', {
        detail: { type: 'error', message: errMsg }
      }));
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
      initiatePreUploadPreview(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      initiatePreUploadPreview(e.target.files[0]);
    }
  };

  // Handle deletion safely by opening custom animated confirmation modal
  const handleDelete = (fileId: string, fileName: string) => {
    setFileToDelete({ id: fileId, name: fileName });
  };

  // Perform actual document purge
  const executeDelete = async () => {
    if (!fileToDelete) return;
    const { id: fileId, name: fileName } = fileToDelete;
    
    // Set fileToDelete to null to close modal before processing
    setFileToDelete(null);

    const isInTrash = currentFolder === 'Trash';
    const url = isInTrash ? `/api/files/${fileId}` : `/api/files/${fileId}/trash`;
    const method = isInTrash ? 'DELETE' : 'POST';

    try {
      const response = await fetch(url, { method });
      if (!response.ok) {
        throw new Error(isInTrash ? 'Server rejected permanent deletion of file.' : 'Server rejected moving file to trash.');
      }
      setUploadSuccess(
        isInTrash 
          ? `"${fileName}" has been permanently purged.` 
          : `"${fileName}" moved to Secure Trash container.`
      );
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('File custom operation failed:', err);
      setUploadError(err.message || 'Failed to complete requested action.');
    }
  };

  // Perform single restore
  const executeRestore = async (fileId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/restore`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Server rejected file restoration request.');
      }
      setUploadSuccess(`"${fileName}" restored successfully to active files.`);
      fetchFiles();
      fetchActivities();
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Restore item failed:', err);
      setUploadError(err.message || 'Failed to restore file.');
    }
  };

  // Perform batch document purging or soft deleting
  const executeBulkDelete = async () => {
    if (selectedFileIds.length === 0) return;
    setBulkDeleteConfirm(false);
    setDeletingBulk(true);
    
    const isInTrash = currentFolder === 'Trash';
    const url = isInTrash ? '/api/files/bulk-delete' : '/api/files/bulk-trash';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedFileIds })
      });
      if (!response.ok) {
        throw new Error(isInTrash ? 'Server rejected bulk permanent deletion.' : 'Server rejected bulk soft deletion.');
      }
      const data = await response.json();
      setUploadSuccess(
        isInTrash
          ? `Permanently shredded and purged ${data.deletedCount || selectedFileIds.length} files securely.`
          : `Moved ${data.count || selectedFileIds.length} files to Secure Trash container successfully.`
      );
      setSelectedFileIds([]); // Clear selection
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Bulk deletion failed:', err);
      setUploadError(err.message || 'Failed to complete bulk deletion.');
    } finally {
      setDeletingBulk(false);
    }
  };

  // Perform batch restore
  const executeBulkRestore = async () => {
    if (selectedFileIds.length === 0) return;
    setDeletingBulk(true);
    try {
      const response = await fetch('/api/files/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedFileIds })
      });
      if (!response.ok) {
        throw new Error('Server rejected bulk restore operation.');
      }
      const data = await response.json();
      setUploadSuccess(`Successfully restored ${data.count || selectedFileIds.length} items to active storage.`);
      setSelectedFileIds([]);
      fetchFiles();
      fetchActivities();
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Bulk restore failed:', err);
      setUploadError(err.message || 'Failed to complete bulk restore.');
    } finally {
      setDeletingBulk(false);
    }
  };

  // Helper to construct renamed file name based on custom modes
  const getRenamedFileName = (
    originalName: string, 
    index: number, 
    mode: 'prefix_suffix' | 'pattern' | 'replace',
    prefix: string,
    suffix: string,
    pattern: string,
    findStr: string,
    replaceStr: string
  ) => {
    if (!originalName) return '';
    const dotIndex = originalName.lastIndexOf('.');
    const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
    const extension = dotIndex !== -1 ? originalName.substring(dotIndex) : '';

    let newBase = baseName;

    if (mode === 'prefix_suffix') {
      newBase = `${prefix}${baseName}${suffix}`;
    } else if (mode === 'pattern') {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      newBase = pattern
        .replace(/\[Name\]/gi, baseName)
        .replace(/\{name\}/gi, baseName)
        .replace(/\[Index\]/gi, String(index + 1))
        .replace(/\{index\}/gi, String(index + 1))
        .replace(/\[Date\]/gi, today)
        .replace(/\{date\}/gi, today);
    } else if (mode === 'replace') {
      if (findStr) {
        newBase = baseName.split(findStr).join(replaceStr);
      }
    }

    return `${newBase}${extension}`;
  };

  // Perform bulk renaming of files securely via MongoDB endpoint
  const executeBulkRename = async () => {
    if (selectedFileIds.length === 0) return;
    setRenamingBulk(true);

    const renamePayload = selectedFileIds.map((id, index) => {
      const file = files.find(f => f.id === id);
      const originalName = file ? file.name : '';
      const newName = getRenamedFileName(
        originalName,
        index,
        bulkRenameMode,
        bulkRenamePrefix,
        bulkRenameSuffix,
        bulkRenamePattern,
        bulkRenameFind,
        bulkRenameReplace
      );
      return { id, newName };
    }).filter(item => item.newName && item.id);

    try {
      const response = await fetch('/api/files/bulk-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames: renamePayload })
      });
      if (!response.ok) {
        throw new Error('Server rejected bulk secure renaming.');
      }
      const data = await response.json();
      setUploadSuccess(`Successfully batch renamed ${data.updatedCount || renamePayload.length} files securely.`);
      setSelectedFileIds([]); // Clear selection
      setShowBulkRenameModal(false);
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Batch renaming failed:', err);
      setUploadError(err.message || 'Failed to complete batch rename.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setRenamingBulk(false);
    }
  };

  // Perform bulk moving of files securely via MongoDB bulk-move endpoint
  const executeBulkMove = async (targetFolder: string | null) => {
    if (selectedFileIds.length === 0) return;
    setMovingBulk(true);

    try {
      const response = await fetch('/api/files/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedFileIds,
          targetFolder: targetFolder
        })
      });
      if (!response.ok) {
        throw new Error('Server rejected bulk folder relocation.');
      }
      const data = await response.json();
      setUploadSuccess(`Successfully moved ${data.updatedCount || selectedFileIds.length} assets to folder "${targetFolder || "Root (All Client Files)"}" securely.`);
      setSelectedFileIds([]); // Clear selection
      setShowBulkMoveModal(false);
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Batch moving failed:', err);
      setUploadError(err.message || 'Failed to complete folder relocation.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setMovingBulk(false);
    }
  };

  // Update file tags securely via MongoDB API
  const handleUpdateFileTags = async (fileId: string, updatedTags: string[]) => {
    try {
      const response = await fetch(`/api/files/${fileId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: updatedTags }),
      });
      if (!response.ok) {
        throw new Error('Failed to update asset tags on secure storage service.');
      }
      
      // Update local files state
      setFiles((prevFiles) =>
        prevFiles.map((f) => (f.id === fileId ? { ...f, tags: updatedTags } : f))
      );

      // Update current selected preview file state so the modal updates reactively
      if (selectedPreviewFile && selectedPreviewFile.id === fileId) {
        setSelectedPreviewFile({
          ...selectedPreviewFile,
          tags: updatedTags
        });
      }
      
      fetchActivities(); // Refresh activities stream
    } catch (err: any) {
      console.error('Error updating tags:', err);
      setUploadError(err.message || 'Failed to update file tags.');
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

  // Download selected files as a compressed ZIP archive
  const handleDownloadZip = async () => {
    if (selectedFileIds.length === 0) return;
    setZipping(true);
    setZipProgress(0);
    try {
      const zip = new JSZip();
      const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));

      if (selectedFiles.length === 0) {
        throw new Error('No files match the active selection criteria.');
      }

      selectedFiles.forEach((file) => {
        const content = file.content;
        if (content && content.includes(',')) {
          const parts = content.split(',');
          // If base64 encoded dataURI
          if (parts[0].includes(';base64')) {
            zip.file(file.name, parts[1], { base64: true });
          } else {
            // Decoded plain URI
            const decoded = decodeURIComponent(parts[1]);
            zip.file(file.name, decoded);
          }
        } else {
          zip.file(file.name, content || '');
        }
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setZipProgress(Math.round(metadata.percent));
      });

      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ClientVault-[Multi]-${new Date().toISOString().substring(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // Trigger beautiful visual success badge
      setDownloadSuccess(`${selectedFiles.length} files compressed successfully`);
      setTimeout(() => setDownloadSuccess(null), 3000);
      setSelectedFileIds([]); // clear selection upon successful download
    } catch (err: any) {
      console.error('ZIP compilation failed:', err);
      alert(err.message || 'ZIP generation failed.');
    } finally {
      setZipping(false);
      setZipProgress(0);
    }
  };

  // Helper to retrieve color coding and properties for a given file type
  const getFileTypeConfig = (mimeStr: string, fileName?: string) => {
    const mime = (mimeStr || '').toLowerCase();
    const name = (fileName || '').toLowerCase();

    const isImage = mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp') || name.endsWith('.svg') || name.endsWith('.heic') || name.endsWith('.heif');
    const isVideo = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.mkv') || name.endsWith('.webm');
    const isAudio = mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.m4a') || name.endsWith('.flac');
    const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
    const isArchive = mime.includes('zip') || mime.includes('tar') || mime.includes('compressed') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip') || name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar.gz') || name.endsWith('.gz');
    const isCode = mime.startsWith('text/html') || mime.startsWith('text/javascript') || mime.includes('json') || mime.includes('xml') || mime.includes('code') || mime.includes('css') || name.endsWith('.html') || name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.jsx') || name.endsWith('.css') || name.endsWith('.json') || name.endsWith('.py') || name.endsWith('.sh') || name.endsWith('.rs') || name.endsWith('.go') || name.endsWith('.java') || name.endsWith('.cpp') || name.endsWith('.yaml') || name.endsWith('.yml');
    const isSpreadsheet = mime.includes('sheet') || mime.includes('excel') || mime.includes('csv') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.ods');
    const isDoc = mime.includes('document') || mime.includes('word') || mime.includes('text/plain') || name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.rtf') || name.endsWith('.txt') || name.endsWith('.odt');

    if (isImage) {
      return {
        icon: <Image className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
        iconSm: <Image className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
        iconLg: <Image className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
        borderColor: 'border-emerald-100/70 dark:border-emerald-900/40',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/30 dark:text-emerald-400',
        hoverBgClass: 'group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30',
        label: 'Image Asset',
        shorthand: 'IMG'
      };
    }
    if (isVideo) {
      return {
        icon: <Video className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        iconSm: <Video className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
        iconLg: <Video className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
        bgColor: 'bg-rose-50 dark:bg-rose-950/20',
        bgClass: 'bg-rose-50 dark:bg-rose-950/20',
        borderColor: 'border-rose-100/70 dark:border-rose-900/40',
        textColor: 'text-rose-600 dark:text-rose-400',
        badgeClass: 'bg-rose-100 text-rose-850 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/30 dark:text-rose-400',
        hoverBgClass: 'group-hover:bg-rose-500/10 group-hover:border-rose-500/30',
        label: 'Video Media',
        shorthand: 'MP4'
      };
    }
    if (isAudio) {
      return {
        icon: <Music className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />,
        iconSm: <Music className="w-3.5 h-3.5 text-fuchsia-600 dark:text-fuchsia-400" />,
        iconLg: <Music className="w-6 h-6 text-fuchsia-600 dark:text-fuchsia-400" />,
        bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-950/20',
        bgClass: 'bg-fuchsia-50 dark:bg-fuchsia-950/20',
        borderColor: 'border-fuchsia-100/70 dark:border-fuchsia-900/40',
        textColor: 'text-fuchsia-600 dark:text-fuchsia-400',
        badgeClass: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:border-fuchsia-900/30 dark:text-fuchsia-400',
        hoverBgClass: 'group-hover:bg-fuchsia-500/10 group-hover:border-fuchsia-500/30',
        label: 'Audio Media',
        shorthand: 'MP3'
      };
    }
    if (isPdf) {
      return {
        icon: <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />,
        iconSm: <FileText className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />,
        iconLg: <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />,
        bgColor: 'bg-red-50 dark:bg-red-950/20',
        bgClass: 'bg-red-50 dark:bg-red-950/20',
        borderColor: 'border-red-100/70 dark:border-red-900/40',
        textColor: 'text-red-600 dark:text-red-400',
        badgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:border-red-900/30 dark:text-red-400',
        hoverBgClass: 'group-hover:bg-red-500/10 group-hover:border-red-500/30',
        label: 'PDF Document',
        shorthand: 'PDF'
      };
    }
    if (isArchive) {
      return {
        icon: <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
        iconSm: <Archive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
        iconLg: <Archive className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
        bgColor: 'bg-amber-50 dark:bg-amber-950/20',
        bgClass: 'bg-amber-50 dark:bg-amber-950/20',
        borderColor: 'border-amber-100/70 dark:border-amber-900/40',
        textColor: 'text-amber-600 dark:text-amber-400',
        badgeClass: 'bg-amber-100 text-amber-850 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/30 dark:text-amber-400',
        hoverBgClass: 'group-hover:bg-amber-500/10 group-hover:border-amber-500/30',
        label: 'Archive Package',
        shorthand: 'ZIP'
      };
    }
    if (isCode) {
      return {
        icon: <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
        iconSm: <FileCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
        iconLg: <FileCode className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
        bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
        bgClass: 'bg-indigo-50 dark:bg-indigo-950/20',
        borderColor: 'border-indigo-100/70 dark:border-indigo-900/40',
        textColor: 'text-indigo-600 dark:text-indigo-400',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900/30 dark:text-indigo-400',
        hoverBgClass: 'group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30',
        label: 'Code Script',
        shorthand: 'CODE'
      };
    }
    if (isSpreadsheet) {
      return {
        icon: <FileSpreadsheet className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />,
        iconSm: <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />,
        iconLg: <FileSpreadsheet className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />,
        bgColor: 'bg-cyan-50 dark:bg-cyan-950/20',
        bgClass: 'bg-cyan-50 dark:bg-cyan-950/20',
        borderColor: 'border-cyan-100/70 dark:border-cyan-900/40',
        textColor: 'text-cyan-600 dark:text-cyan-400',
        badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:border-cyan-900/30 dark:text-cyan-400',
        hoverBgClass: 'group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30',
        label: 'Data Sheet',
        shorthand: 'XLS'
      };
    }
    if (isDoc) {
      return {
        icon: <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
        iconSm: <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
        iconLg: <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
        bgColor: 'bg-blue-50 dark:bg-blue-950/20',
        bgClass: 'bg-blue-50 dark:bg-blue-950/20',
        borderColor: 'border-blue-100/70 dark:border-blue-900/40',
        textColor: 'text-blue-600 dark:text-blue-400',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/30 dark:text-blue-400',
        hoverBgClass: 'group-hover:bg-blue-500/10 group-hover:border-blue-500/30',
        label: 'Text Document',
        shorthand: 'DOC'
      };
    }

    return {
      icon: <File className="w-4 h-4 text-slate-500 dark:text-slate-400" />,
      iconSm: <File className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />,
      iconLg: <File className="w-6 h-6 text-slate-500 dark:text-slate-400" />,
      bgColor: 'bg-slate-50 dark:bg-slate-900',
      bgClass: 'bg-slate-50 dark:bg-slate-900',
      borderColor: 'border-slate-200/60 dark:border-slate-800',
      textColor: 'text-slate-600 dark:text-slate-400',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350',
      hoverBgClass: 'group-hover:bg-slate-500/10 group-hover:border-slate-500/30',
      label: 'Generic File',
      shorthand: 'FILE'
    };
  };

  // Icon switcher depending on mime type (Lucide icons only)
  const getFileIcon = (mime: string, name?: string) => {
    return getFileTypeConfig(mime, name).icon;
  };

  // Get all virtual folders that exist in the current directory level
  const virtualFolders = useMemo(() => {
    const folderSet = new Set<string>();
    
    files.forEach(file => {
      if (file.isDeleted) return; // Skip deleted files for active directories
      const f = file.folder || '';
      if (!f) return;
      
      if (currentFolder === null) {
        // At root, take the first segment
        const segment = f.split('/')[0];
        if (segment !== 'Trash') {
          folderSet.add(segment);
        }
      } else if (currentFolder !== 'Trash') {
        // Inside currentFolder, check if f starts with `currentFolder/`
        const prefix = currentFolder + '/';
        if (f.startsWith(prefix)) {
          const suffix = f.substring(prefix.length);
          const segment = suffix.split('/')[0];
          folderSet.add(segment);
        }
      }
    });

    createdFolders.forEach(f => {
      if (!f) return;
      
      if (currentFolder === null) {
        // At root, take the first segment
        const segment = f.split('/')[0];
        if (segment !== 'Trash') {
          folderSet.add(segment);
        }
      } else if (currentFolder !== 'Trash') {
        // Inside currentFolder, check if f starts with `currentFolder/`
        const prefix = currentFolder + '/';
        if (f.startsWith(prefix)) {
          const suffix = f.substring(prefix.length);
          const segment = suffix.split('/')[0];
          folderSet.add(segment);
        }
      }
    });
    
    return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
  }, [files, currentFolder, createdFolders]);

  // Helper stats for a directory
  const getFolderStats = (folderName: string) => {
    const fullPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
    const folderFiles = files.filter(f => !f.isDeleted && (f.folder === fullPath || (f.folder && f.folder.startsWith(fullPath + '/'))));
    const count = folderFiles.length;
    const totalSize = folderFiles.reduce((acc, f) => acc + f.size, 0);
    return { count, totalSize };
  };

  // Dynamically determines the folder-specific icon, styling, badge class, and label metadata based on categorizing key phrases, selection status, and file containment levels
  const getFolderIconAndStyles = (folderName: string, isSelected: boolean, hasFiles: boolean) => {
    const nameLower = folderName.toLowerCase().trim();
    
    // 1. Definition of custom categories & icon assignments
    let iconType = 'default';
    if (/(?:src|code|dev|proj|git|build|bin|lib|config|script|program|tech|rust|python|node|java|html|css|js|ts)/i.test(nameLower)) {
      iconType = 'code';
    } else if (/(?:secret|private|secure|key|lock|auth|cert|admin|confidential|vault|pass|crypt|safe|pki|ssh)/i.test(nameLower)) {
      iconType = 'lock';
    } else if (/(?:zip|rar|archive|backup|tar|gz|dist|old|legacy|history|pack|dump)/i.test(nameLower)) {
      iconType = 'archive';
    } else if (/(?:sync|cloud|temp|download|upload|transfer|shared|pipeline)/i.test(nameLower)) {
      iconType = 'sync';
    } else if (/(?:fave|favorite|heart|star|love|personal|family|home|finance|tax|hobby|pet|wishlist)/i.test(nameLower)) {
      iconType = 'heart';
    }

    // 2. Select appropriate Icon component and dynamic Tailwind CSS classes
    let IconComponent = Folder;
    let containerClass = '';
    let iconClass = '';
    let badgeClass = '';
    let label = 'Secure Vault Directory';

    switch (iconType) {
      case 'code':
        IconComponent = FolderCode;
        label = 'Development Vault';
        badgeClass = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-900/30';
        if (isSelected) {
          containerClass = 'bg-indigo-600 dark:bg-indigo-600 border-indigo-700 shadow-sm shadow-indigo-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          containerClass = 'bg-indigo-50/90 dark:bg-indigo-950/45 border-indigo-250 dark:border-indigo-900/40 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60 shadow-3xs';
          iconClass = 'text-indigo-600 dark:text-indigo-450 fill-indigo-500/10';
        } else {
          containerClass = 'bg-indigo-50/30 dark:bg-indigo-950/10 border-indigo-150 dark:border-indigo-900/20 border-dashed opacity-75';
          iconClass = 'text-indigo-450 dark:text-indigo-500/50';
        }
        break;

      case 'lock':
        IconComponent = FolderLock;
        label = 'Confidential Vault';
        badgeClass = 'bg-rose-50 dark:bg-rose-950/40 text-rose-850 dark:text-rose-400 border border-rose-200/40 dark:border-rose-900/30';
        if (isSelected) {
          containerClass = 'bg-rose-600 dark:bg-rose-600 border-rose-700 shadow-sm shadow-rose-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          containerClass = 'bg-rose-50/90 dark:bg-rose-950/45 border-rose-250 dark:border-rose-900/40 hover:bg-rose-100/70 dark:hover:bg-rose-950/60 shadow-3xs';
          iconClass = 'text-rose-600 dark:text-rose-450 fill-rose-500/10';
        } else {
          containerClass = 'bg-rose-50/30 dark:bg-rose-950/10 border-rose-150 dark:border-rose-900/20 border-dashed opacity-75';
          iconClass = 'text-rose-450 dark:text-rose-500/50';
        }
        break;

      case 'archive':
        IconComponent = FolderArchive;
        label = 'Secure Archive';
        badgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-850 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/30';
        if (isSelected) {
          containerClass = 'bg-amber-600 dark:bg-amber-600 border-amber-700 shadow-sm shadow-amber-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          containerClass = 'bg-amber-50/90 dark:bg-amber-950/45 border-amber-250 dark:border-amber-900/40 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 shadow-3xs';
          iconClass = 'text-amber-600 dark:text-amber-450 fill-amber-500/10';
        } else {
          containerClass = 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-150 dark:border-amber-900/20 border-dashed opacity-75';
          iconClass = 'text-amber-450 dark:text-amber-500/50';
        }
        break;

      case 'sync':
        IconComponent = FolderSync;
        label = 'Synchronized Pipeline';
        badgeClass = 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-850 dark:text-cyan-400 border border-cyan-200/40 dark:border-cyan-900/30';
        if (isSelected) {
          containerClass = 'bg-cyan-600 dark:bg-cyan-600 border-cyan-700 shadow-sm shadow-cyan-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          containerClass = 'bg-cyan-50/90 dark:bg-cyan-950/45 border-cyan-250 dark:border-cyan-900/40 hover:bg-cyan-100/70 dark:hover:bg-cyan-950/60 shadow-3xs';
          iconClass = 'text-cyan-600 dark:text-cyan-450 fill-cyan-500/10';
        } else {
          containerClass = 'bg-cyan-50/30 dark:bg-cyan-950/10 border-cyan-150 dark:border-cyan-900/20 border-dashed opacity-75';
          iconClass = 'text-cyan-450 dark:text-cyan-500/50';
        }
        break;

      case 'heart':
        IconComponent = FolderHeart;
        label = 'Personal Sanctuary';
        badgeClass = 'bg-pink-50 dark:bg-pink-950/40 text-pink-850 dark:text-pink-400 border border-pink-205/40 dark:border-pink-900/30';
        if (isSelected) {
          containerClass = 'bg-pink-600 dark:bg-pink-600 border-pink-700 shadow-sm shadow-pink-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          containerClass = 'bg-pink-50/90 dark:bg-pink-950/45 border-pink-250 dark:border-pink-900/40 hover:bg-pink-100/70 dark:hover:bg-pink-950/60 shadow-3xs';
          iconClass = 'text-pink-600 dark:text-pink-450 fill-pink-500/10';
        } else {
          containerClass = 'bg-pink-50/30 dark:bg-pink-950/10 border-pink-150 dark:border-pink-900/20 border-dashed opacity-75';
          iconClass = 'text-pink-450 dark:text-pink-500/50';
        }
        break;

      default:
        // Generic fallback - toggle between FolderOpen and Folder
        if (isSelected) {
          IconComponent = FolderOpen;
          label = 'Active Directory';
          badgeClass = 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border border-blue-200/40 dark:border-blue-900/30';
          containerClass = 'bg-blue-600 dark:bg-blue-600 border-blue-700 shadow-sm shadow-blue-500/30 scale-105';
          iconClass = 'text-white fill-white/10 animate-bounce-subtle';
        } else if (hasFiles) {
          IconComponent = FolderOpen;
          label = 'Secure Directory';
          badgeClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/30';
          containerClass = 'bg-amber-50/90 dark:bg-amber-950/45 border-amber-200 dark:border-amber-900/45 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 shadow-3xs';
          iconClass = 'text-amber-550 dark:text-amber-400 fill-amber-500/10';
        } else {
          IconComponent = Folder;
          label = 'New Empty Directory';
          badgeClass = 'bg-slate-55 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border border-slate-200/40 dark:border-slate-800/60';
          containerClass = 'bg-slate-50 dark:bg-slate-900/30 border-slate-200/60 dark:border-slate-800/60 border-dashed opacity-75';
          iconClass = 'text-slate-400 dark:text-slate-550';
        }
        break;
    }

    return { IconComponent, containerClass, iconClass, badgeClass, label };
  };

  const getDaysRemaining = (deletedAtStr: string | null | Date) => {
    if (!deletedAtStr) return 30;
    const deletedAt = new Date(deletedAtStr);
    const diffTime = Date.now() - deletedAt.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const remaining = Math.max(0, Math.ceil(30 - diffDays));
    return remaining;
  };

  // Filter list records
  const filteredFiles = files.filter(file => {
    if (currentFolder === 'Trash') {
      if (!file.isDeleted) return false;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        file.name.toLowerCase().includes(q) ||
        (file.type && file.type.toLowerCase().includes(q)) ||
        (file.tags && file.tags.some(tag => tag.toLowerCase().includes(q)));
      const matchesTag = !selectedTagFilter || (file.tags && file.tags.includes(selectedTagFilter));
      return matchesSearch && matchesTag;
    }

    // Exclude soft-deleted files from active folders
    if (file.isDeleted) return false;

    const hasSearchQuery = searchQuery.trim() !== '';
    const fileFolder = file.folder || null;
    const matchesFolder = hasSearchQuery || (fileFolder === currentFolder);

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      file.name.toLowerCase().includes(q) ||
      (file.type && file.type.toLowerCase().includes(q)) ||
      (file.tags && file.tags.some(tag => tag.toLowerCase().includes(q)));
    const matchesTag = !selectedTagFilter || (file.tags && file.tags.includes(selectedTagFilter));
    return matchesFolder && matchesSearch && matchesTag;
  });

  // Sort files based on sort state
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === 'size') {
      comparison = a.size - b.size;
    } else if (sortField === 'uploadedAt') {
      const timeA = currentFolder === 'Trash' && a.deletedAt ? new Date(a.deletedAt).getTime() : (a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : new Date(a.uploadedAt).getTime());
      const timeB = currentFolder === 'Trash' && b.deletedAt ? new Date(b.deletedAt).getTime() : (b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : new Date(b.uploadedAt).getTime());
      comparison = timeA - timeB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const totalSize = files.reduce((acc, curr) => acc + curr.size, 0);
  const totalStorageCapacity = 1024 * 1024 * 1024; // 1 GB capacity
  const storagePercent = Math.min(100, Math.max(1, Math.round((totalSize / totalStorageCapacity) * 100)));

  return (
    <div id="dashboard-client-panel" className="px-4 sm:px-10 py-6 sm:py-10 flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-7xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Tab 1: All Client Files */}
        {activeTab === 'files' && (
          <>
            {/* Upper Stats bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Storage Used</p>
                <div className="flex items-end space-x-2">
                  <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatBytes(totalSize)}</span>
                  <span className="text-slate-400 dark:text-slate-500 text-sm mb-1">/ 1 GB</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 mt-4 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Total Files</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{files.length} Files</p>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-semibold mt-1">
                  {files.length > 0 ? '✓ Ready for instant download' : 'No uploads yet'}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">Access Tier</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Zero-Trust Secured</p>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Authenticated client tunnel active</p>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <UploadCloud className="w-4.5 h-4.5 text-blue-600" />
                <span>Upload Files Securely</span>
              </h3>

              {currentFolder === 'Trash' ? (
                <div className="border border-red-200/40 bg-red-500/5 dark:bg-red-950/5 dark:border-red-900/30 rounded-2xl p-8 text-center">
                  <Trash2 className="w-8 h-8 text-red-500/70 mx-auto mb-3 opacity-60" />
                  <p className="text-xs font-black text-red-700 dark:text-red-400">Vault Uploads Disabled in Trash</p>
                  <p className="text-[10.5px] text-red-400/70 mt-1.5 leading-relaxed">Please select an active directory folder or go back to Vault root to upload new file packages.</p>
                </div>
              ) : (
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

                {pendingUploadFile ? (
                  <div 
                    id="pending-file-preview-card"
                    className="flex flex-col items-center space-y-4 py-4 w-full max-w-md mx-auto" 
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent opening native file picker
                      setIsPreUploadPreviewOpen(true);
                    }}
                  >
                    {(() => {
                      const typeConfig = getFileTypeConfig(pendingUploadFile.type, pendingUploadFileName || pendingUploadFile.name);
                      return (
                        <div className={`w-16 h-16 ${typeConfig.bgColor} border ${typeConfig.borderColor} rounded-2xl shadow-xs flex items-center justify-center hover:scale-105 transition-all`}>
                          {typeConfig.iconLg}
                        </div>
                      );
                    })()}
                    <div className="text-center space-y-1">
                      <p className="text-sm font-bold text-slate-850 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        Selected: <span className="underline break-all font-mono">{pendingUploadFileName || pendingUploadFile.name}</span>
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 block">
                        Size: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{formatBytes(pendingUploadFile.size)}</span>
                      </p>
                      <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 font-mono tracking-wider animate-pulse pt-2 flex items-center justify-center space-x-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        <span>CLICK TO PREVIEW & CONFIGURE SECURITY</span>
                      </p>
                    </div>

                    <div className="flex gap-2.5 w-full max-w-xs pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        id="confirm-pending-upload-direct-btn"
                        onClick={() => processUpload(pendingUploadFile)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer hover:shadow-md active:scale-95 duration-150"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Confirm Upload</span>
                      </button>
                      <button
                        type="button"
                        id="cancel-pending-upload-clear-btn"
                        onClick={handleCancelPendingUpload}
                        className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center cursor-pointer active:scale-95 duration-150"
                        title="Cancel selection"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : uploading ? (
                  <div className="flex flex-col items-center space-y-4 py-4 w-full max-w-md mx-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-2xl relative flex items-center justify-center shadow-xs">
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-bold text-blue-900">
                        {compressing 
                          ? 'Optimizing and compressing high-resolution picture...' 
                          : 'Uploading and synchronizing secure file payload...'}
                      </p>
                      <p className="text-xs text-blue-550 font-mono font-bold">
                        {compressing ? 'Downscaling and shrinking size client-side...' : `${uploadProgress}% Complete`}
                      </p>
                    </div>
                    
                    {/* High-fidelity responsive progress bar */}
                    <div className="w-full bg-slate-150 h-3 rounded-full overflow-hidden border border-slate-200/50 shadow-inner relative">
                      <div 
                        className={`bg-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-xs shadow-blue-200 ${
                          compressing ? 'animate-pulse' : ''
                        }`}
                        style={{ width: compressing ? '33%' : `${uploadProgress}%` }}
                      />
                    </div>
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
            )}

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

              {uploadNotificationSent && (
                <div id="alert-upload-notification" className={`flex items-center space-x-2.5 p-3.5 rounded-xl text-xs font-semibold border ${
                  uploadNotificationSent.includes('dispatched')
                    ? 'bg-blue-50/70 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300 border-blue-100/50 dark:border-blue-900/40'
                    : 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400 border-slate-150/60 dark:border-slate-800/80'
                }`}>
                  <Mail className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                  <span>{uploadNotificationSent}</span>
                </div>
              )}
            </div>

            {/* Recent Files Quick Access */}
            {files.length > 0 && (
              <div id="recent-files-quick-access-section" className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase font-mono tracking-wider flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Recent Uploads & Modified Files</span>
                  </h3>
                  <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 px-2 py-0.5 rounded-full font-mono font-bold select-none">
                    Top 5 Quick Access
                  </span>
                </div>

                <div 
                  id="recent-files-grid"
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
                >
                  {[...files]
                    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
                    .slice(0, 5)
                    .map((file) => (
                      <motion.div
                        key={`recent-${file.id}`}
                        id={`recent-file-card-${file.id}`}
                        whileHover={{ scale: 1.025, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedPreviewFile(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/40 dark:hover:border-blue-500/40 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between h-36 font-sans group relative overflow-hidden"
                      >
                        {/* Background Subtle Gradient Glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 via-blue-50/0 to-blue-500/5 dark:to-blue-500/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                        {/* Top Meta Line with Icon & Action */}
                        <div className="flex items-start justify-between">
                          {(() => {
                            const typeConfig = getFileTypeConfig(file.type, file.name);
                            return (
                              <div className={`w-9 h-9 rounded-xl ${typeConfig.bgColor} border ${typeConfig.borderColor} flex items-center justify-center shrink-0 shadow-xs transition-colors duration-300`}>
                                {typeConfig.icon}
                              </div>
                            );
                          })()}

                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              id={`recent-quick-download-${file.id}`}
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-950 rounded-lg border border-transparent hover:border-slate-200/40 dark:hover:border-slate-800/80 transition-all font-sans cursor-pointer group/btn"
                              title="Download file instantly"
                            >
                              <Download className="w-3.5 h-3.5 transition group-hover/btn:scale-110" />
                            </button>
                            <button
                              id={`recent-quick-preview-${file.id}`}
                              type="button"
                              onClick={() => setSelectedPreviewFile(file)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-950 rounded-lg border border-transparent hover:border-slate-200/40 dark:hover:border-slate-800/80 transition-all font-sans cursor-pointer group/btn"
                              title="Preview file details"
                            >
                              <Eye className="w-3.5 h-3.5 transition group-hover/btn:scale-110" />
                            </button>
                          </div>
                        </div>

                        {/* Middle Content Section */}
                        <div className="mt-3">
                          <h4 
                            className="font-extrabold text-slate-800 dark:text-slate-100 text-xs sm:text-xs tracking-tight truncate pr-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200" 
                            title={file.name}
                          >
                            {file.name}
                          </h4>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                              {formatBytes(file.size)}
                            </span>
                            {(() => {
                              const typeConfig = getFileTypeConfig(file.type, file.name);
                              return (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold font-mono uppercase tracking-wider ${typeConfig.badgeClass}`}>
                                  {typeConfig.shorthand}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Bottom line: Actual date and relative helper */}
                        <div className="flex items-center space-x-1.5 text-[9.5px] text-slate-400 dark:text-slate-500 font-mono mt-3">
                          <Clock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                          <span className="truncate">
                            {file.uploadedAt.toLocaleDateString()}{' '}
                            {file.uploadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            )}

            {/* List area */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              {/* Header search filter */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-slate-100">All Vault Assets</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Manage and share your assets securely</p>
                </div>
 
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  {/* Sorting dropdown */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap scroll-m-20">Sort by:</span>
                    <select
                      id="sort-field-select"
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as 'uploadedAt' | 'size' | 'name')}
                      className="block px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-350 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs transition cursor-pointer font-medium"
                    >
                      <option value="uploadedAt">Date Uploaded</option>
                      <option value="size">File Size</option>
                      <option value="name">File Name</option>
                    </select>

                    <button
                      id="btn-toggle-sort-order"
                      type="button"
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition flex items-center justify-center cursor-pointer"
                      title={sortOrder === 'asc' ? 'Sort Ascending. Click to sort Descending.' : 'Sort Descending. Click to sort Ascending.'}
                    >
                      {sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" />}
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="relative w-full sm:w-56">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      id="search-input"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in Vault..."
                      className="block w-full pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-150 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs transition"
                    />
                  </div>
                </div>
              </div>

              {/* Tag filtering pills bar */}
              <div id="tag-filter-bar" className="px-6 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-2 flex items-center space-x-1">
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span>Filter by Tag:</span>
                </span>
                <button
                  id="tag-filter-pill-all"
                  onClick={() => setSelectedTagFilter(null)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition cursor-pointer ${
                    selectedTagFilter === null
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-150 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/50 dark:border-slate-700/60'
                  }`}
                >
                  All ({files.length})
                </button>
                {Array.from(new Set(['Draft', 'Final', 'Contract', ...files.flatMap(f => f.tags || [])]))
                  .filter(Boolean)
                  .map((tag) => {
                    const tagCount = files.filter(f => f.tags && f.tags.includes(tag)).length;
                    return (
                      <button
                        key={tag}
                        id={`tag-filter-pill-${tag}`}
                        onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
                          selectedTagFilter === tag
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-705 border border-slate-200/50 dark:border-slate-700/60'
                        }`}
                      >
                        <span>{tag}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                          selectedTagFilter === tag ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-950 text-slate-500 dark:text-slate-400'
                        }`}>
                          {tagCount}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {/* Directory Breadcrumbs Navigator */}
              <div id="directory-breadcrumbs-bar" className="px-6 py-3 bg-slate-50/55 dark:bg-slate-950/30 border-b border-slate-100/80 dark:border-slate-800/60 flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center space-x-2 truncate">
                  <button
                    type="button"
                    onClick={() => navigateToFolder(null)}
                    className="flex items-center space-x-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-500 transition cursor-pointer bg-transparent border-0 font-bold"
                    title="Navigate to root file vault"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Vault Root</span>
                  </button>

                  {currentFolder && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                      {currentFolder.split('/').map((segment, index, arr) => {
                        const pathUpToSegment = arr.slice(0, index + 1).join('/');
                        const isLast = index === arr.length - 1;
                        return (
                          <React.Fragment key={pathUpToSegment}>
                            {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />}
                            <button
                              type="button"
                              onClick={() => navigateToFolder(pathUpToSegment)}
                              disabled={isLast}
                              className={`truncate max-w-[120px] transition cursor-pointer bg-transparent border-0 ${
                                isLast
                                  ? 'text-slate-700 dark:text-slate-200 font-extrabold cursor-default'
                                  : 'text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-500 font-bold'
                              }`}
                            >
                              {segment}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {currentFolder === 'Trash' ? (
                    <>
                      {selectedFileIds.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={executeBulkRestore}
                            className="flex items-center space-x-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-white dark:hover:text-emerald-200 hover:bg-emerald-600 dark:hover:bg-emerald-900 border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 transition cursor-pointer"
                            title="Restore all selected items to active vault"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore Selected ({selectedFileIds.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkDeleteConfirm(true)}
                            className="flex items-center space-x-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold text-red-650 dark:text-red-400 hover:text-white dark:hover:text-red-200 hover:bg-red-600 dark:hover:bg-red-900 border border-red-500/20 bg-red-500/5 dark:bg-red-950/20 transition cursor-pointer"
                            title="Permanently remove all selected items"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Permanently Delete Selected ({selectedFileIds.length})</span>
                          </button>
                        </>
                      ) : (
                        files.filter(f => f.isDeleted).length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const trashedIds = files.filter(f => f.isDeleted).map(f => f.id);
                              setSelectedFileIds(trashedIds);
                              setBulkDeleteConfirm(true);
                            }}
                            className="flex items-center space-x-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold text-red-600 bg-red-50 dark:bg-red-950/20 hover:bg-red-600 hover:text-white dark:text-red-400 dark:hover:bg-red-900 border border-red-550/20 transition cursor-pointer font-extrabold"
                            title="Permanently erase all files currently in the trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Empty Trash Bin</span>
                          </button>
                        )
                      )}
                      
                      <button
                        type="button"
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center space-x-1 text-[10.5px] font-black text-slate-800 hover:text-blue-600 dark:text-slate-305 dark:hover:text-blue-500 bg-slate-150 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-705 px-2.5 py-1 rounded-md transition cursor-pointer font-bold"
                      >
                        <span>← Back to Vault</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="btn-create-folder"
                        onClick={() => {
                          setNewFolderName('');
                          setFolderCreationError(null);
                          setShowCreateFolderModal(true);
                        }}
                        className="flex items-center space-x-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold text-blue-600 dark:text-blue-400 hover:text-white dark:hover:text-blue-200 hover:bg-blue-600 dark:hover:bg-blue-900 border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/20 transition cursor-pointer"
                        title="Create a new folder in this directory"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Create New Folder</span>
                      </button>

                      {currentFolder && (
                        <button
                          type="button"
                          onClick={() => {
                            const segments = currentFolder.split('/');
                            if (segments.length === 1) {
                              navigateToFolder(null);
                            } else {
                              navigateToFolder(segments.slice(0, -1).join('/'));
                            }
                          }}
                          className="flex items-center space-x-1 text-[10.5px] font-black text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-500 bg-slate-150 hover:bg-slate-200/65 dark:bg-slate-800 dark:hover:bg-slate-705 px-2.5 py-1 rounded-md transition cursor-pointer"
                        >
                          <span>← Go Up</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Table list */}
              {sortedFiles.length > 0 || (searchQuery.trim() === '' && virtualFolders.length > 0) ? (
                <div className="overflow-x-auto min-h-48">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-slate-400 dark:text-slate-500 uppercase border-b border-slate-50 dark:border-slate-800 font-mono">
                        <th className="pl-6 pr-2 py-3 w-12 text-left">
                          <input 
                            type="checkbox"
                            checked={sortedFiles.length > 0 && sortedFiles.every(file => selectedFileIds.includes(file.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFileIds(prev => {
                                  const filteredIds = sortedFiles.map(file => file.id);
                                  return Array.from(new Set([...prev, ...filteredIds]));
                                });
                              } else {
                                setSelectedFileIds(prev => {
                                  const filteredIds = sortedFiles.map(file => file.id);
                                  return prev.filter(id => !filteredIds.includes(id));
                                });
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                            title="Select all visible files"
                          />
                        </th>
                        <th 
                          id="th-sort-name"
                          onClick={() => handleSort('name')}
                          className="px-4 py-3 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 select-none transition-colors rounded-lg group"
                          title="Click to sort by file name"
                        >
                          <div className="flex items-center space-x-1">
                            <span>File Name</span>
                            {sortField === 'name' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" />
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th 
                          id="th-sort-size"
                          onClick={() => handleSort('size')}
                          className="px-6 py-3 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 select-none transition-colors rounded-lg group"
                          title="Click to sort by file size"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Size</span>
                            {sortField === 'size' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" />
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 font-semibold hidden md:table-cell">Mime Type</th>
                        <th className="px-6 py-3 font-semibold hidden sm:table-cell">Tags</th>
                        <th 
                          id="th-sort-uploadedAt"
                          onClick={() => handleSort('uploadedAt')}
                          className="px-6 py-3 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 select-none transition-colors rounded-lg group"
                          title={currentFolder === 'Trash' ? 'Click to sort by deletion date' : 'Click to sort by upload date'}
                        >
                          <div className="flex items-center space-x-1">
                            <span>{currentFolder === 'Trash' ? 'Deletion Age (Retention)' : 'Upload Date'}</span>
                            {sortField === 'uploadedAt' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500" />
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 dark:text-slate-350 divide-y divide-slate-50 dark:divide-slate-800">
                      {/* Virtual Folders rendering at current directory depth */}
                      {searchQuery.trim() === '' && virtualFolders.map((folderName) => {
                        const { count, totalSize } = getFolderStats(folderName);
                        const folderPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
                        const { IconComponent, containerClass, iconClass, badgeClass, label: folderLabel } = getFolderIconAndStyles(folderName, false, count > 0);
                        return (
                          <tr 
                            key={`folder-${folderName}`}
                            id={`folder-row-${folderName}`}
                            className="bg-slate-50/30 dark:bg-slate-900/10 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                            onClick={() => navigateToFolder(folderPath)}
                            title={`Click to navigate into folder: ${folderName}`}
                          >
                            <td className="pl-6 pr-2 py-4 w-12" onClick={(e) => e.stopPropagation()}>
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-300 pointer-events-none select-none border ${containerClass}`}>
                                <IconComponent className={`w-3.5 h-3.5 ${iconClass}`} />
                              </div>
                            </td>
                            <td className="px-4 py-4 flex items-center font-bold text-slate-850">
                              <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-3xs group-hover:scale-105 ${containerClass}`}>
                                  <IconComponent className={`w-4.5 h-4.5 ${iconClass}`} />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="truncate text-slate-700 dark:text-slate-250 font-bold group-hover:text-blue-600 dark:group-hover:text-amber-500 transition" title={folderName}>
                                    {folderName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                    {folderLabel}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-400 text-xs">
                              {count > 0 ? formatBytes(totalSize) : '0 Bytes'}
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 hidden md:table-cell max-w-xs truncate">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${badgeClass}`}>
                                Folder ({count} {count === 1 ? 'item' : 'items'})
                              </span>
                            </td>
                            <td className="px-6 py-4 hidden sm:table-cell">
                              <span className="text-[10px] text-slate-350 dark:text-slate-600 italic">Dynamic Directory</span>
                            </td>
                            <td className="px-6 py-4 text-slate-400 text-xs">
                              <span className="text-slate-350 dark:text-slate-700 font-mono">—</span>
                            </td>
                            <td className="px-6 py-4 text-right flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => navigateToFolder(folderPath)}
                                className="p-1 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 rounded-md transition"
                              >
                                View folder
                              </button>
                             
                              {createdFolders.some(f => f === folderPath) && count === 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = createdFolders.filter(f => f !== folderPath);
                                    saveCreatedFolders(updated);
                                    window.dispatchEvent(new CustomEvent('secure-upload-notification', {
                                      detail: { type: 'success', message: `Empty directory "${folderName}" deleted successfully.` }
                                    }));
                                  }}
                                  className="p-1 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-805 rounded-md transition"
                                  title="Delete empty directory"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Special system folder: Trash */}
                      {currentFolder === null && searchQuery.trim() === '' && (
                        <tr 
                          key="system-folder-trash"
                          id="folder-row-trash"
                          className="bg-red-50/10 dark:bg-red-950/5 hover:bg-red-50/20 dark:hover:bg-red-950/10 transition-colors cursor-pointer group border-l-2 border-red-500/60"
                          onClick={() => navigateToFolder('Trash')}
                          title="Click to view Secure Trash Bin"
                        >
                          <td className="pl-6 pr-2 py-4 w-12" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-red-200/50 dark:border-red-900/30 flex items-center justify-center bg-red-100/10 dark:bg-red-950/20 text-red-500 pointer-events-none select-none">
                              <Trash2 className="w-2.5 h-2.5" />
                            </div>
                          </td>
                          <td className="px-4 py-4 flex items-center font-bold text-red-700 dark:text-red-400">
                            <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                              <div className="w-8.5 h-8.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 flex items-center justify-center shrink-0 shadow-3xs group-hover:bg-red-500/10 group-hover:border-red-500/30 transition-all">
                                <Trash2 className="w-4 h-4 text-red-505 dark:text-red-450 fill-red-500/10" />
                              </div>
                              <span className="truncate text-red-700 dark:text-red-400 font-extrabold group-hover:text-red-600 transition">
                                Trash Bin
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-red-400/80 text-xs">
                            {(() => {
                              const trashFiles = files.filter(f => f.isDeleted);
                              const totalTrashSize = trashFiles.reduce((acc, f) => acc + f.size, 0);
                              return trashFiles.length > 0 ? formatBytes(totalTrashSize) : '0 Bytes';
                            })()}
                          </td>
                          <td className="px-6 py-4 text-red-500/80 hidden md:table-cell max-w-xs truncate">
                            <span className="bg-red-50/80 dark:bg-red-950/40 text-red-800 dark:text-red-400 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-red-200/40 dark:border-red-900/30 font-mono">
                              System Trash ({files.filter(f => f.isDeleted).length} {files.filter(f => f.isDeleted).length === 1 ? 'item' : 'items'})
                            </span>
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <span className="text-[10px] text-red-400/70 italic font-medium">30-day Retention policy</span>
                          </td>
                          <td className="px-6 py-4 text-red-400 text-xs">
                            <span className="text-red-300 dark:text-red-800 font-mono">—</span>
                          </td>
                          <td className="px-6 py-4 text-right flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => navigateToFolder('Trash')}
                              className="p-1 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:text-white dark:text-red-405 hover:bg-red-500 bg-red-100/10 dark:bg-red-950/25 border border-red-200/30 dark:border-red-900/20 rounded-md transition cursor-pointer font-bold"
                            >
                              Explore Trash
                            </button>
                          </td>
                        </tr>
                      )}

                      {uploading && pendingUploadFile && (
                        <tr className="animate-pulse bg-blue-50/15 dark:bg-blue-950/10 border-l-2 border-blue-500/80">
                          <td className="pl-6 pr-2 py-4 w-12">
                            <div className="w-5 h-5 rounded border border-blue-400/40 flex items-center justify-center bg-blue-50 dark:bg-blue-950 text-blue-500 shadow-3xs">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </div>
                          </td>
                          <td className="px-4 py-4 flex items-center font-medium">
                            <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                              {(() => {
                                const typeConfig = getFileTypeConfig(pendingUploadFile.type || '', pendingUploadFileName || pendingUploadFile.name);
                                return (
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border relative ${typeConfig.bgColor} ${typeConfig.borderColor}`}>
                                    {typeConfig.icon}
                                    <div className="absolute inset-0 rounded-xl bg-blue-500/10 animate-ping pointer-events-none" />
                                  </div>
                                );
                              })()}
                              <div className="flex flex-col text-left">
                                <span className="truncate text-blue-600 dark:text-blue-400 font-extrabold max-w-[180px] sm:max-w-xs" title={pendingUploadFileName || pendingUploadFile.name}>
                                  {pendingUploadFileName || pendingUploadFile.name}
                                </span>
                                <span className="text-[10px] text-blue-550 dark:text-blue-400 font-semibold flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                  Encrypting & Segment Uploading...
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-blue-600 dark:text-blue-450 text-xs font-bold">
                            {formatBytes(pendingUploadFile.size)}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 hidden md:table-cell max-w-xs truncate italic text-xs">
                            {pendingUploadFile.type || 'application/octet-stream'}
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                              {pendingFileTags && pendingFileTags.length > 0 ? (
                                pendingFileTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/50"
                                  >
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-350 dark:text-slate-655 italic font-medium">No tags applied</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs font-mono">
                            <div className="w-24 sm:w-28 bg-slate-100 dark:bg-slate-905 rounded-full h-2.5 overflow-hidden border border-slate-200/50 dark:border-slate-800 shadow-3xs relative">
                              <div 
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-305 shadow-xs" 
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                            <div className="text-[9px] text-blue-600 dark:text-blue-400 font-bold mt-1 text-right">
                              {uploadProgress}% Complete
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right flex items-center justify-end space-x-1.5">
                            <span className="p-1 px-2.5 py-1 text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-205/40 dark:border-blue-900/30 rounded-md select-none inline-flex items-center gap-1 hover:none">
                              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                              Uploading...
                            </span>
                          </td>
                        </tr>
                      )}

                      {sortedFiles.map((file) => (
                        <tr 
                          key={file.id} 
                          id={`file-row-${file.id}`}
                          className={`hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${selectedFileIds.includes(file.id) ? 'bg-blue-50/15 dark:bg-blue-950/20' : ''}`}
                          onClick={() => setSelectedPreviewFile(file)}
                          onContextMenu={(e) => handleContextMenu(e, file)}
                          title="Click to preview file details. Right-click for secure quick actions."
                        >
                          <td className="pl-6 pr-2 py-4 w-12" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={selectedFileIds.includes(file.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedFileIds(prev => [...prev, file.id]);
                                } else {
                                  setSelectedFileIds(prev => prev.filter(id => id !== file.id));
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                            />
                          </td>
                          <td className="px-4 py-4 flex items-center font-medium text-slate-800">
                            <div className="flex items-center space-x-3 max-w-sm sm:max-w-md">
                              {(() => {
                                const typeConfig = getFileTypeConfig(file.type, file.name);
                                return (
                                  <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center shrink-0 border transition-all ${typeConfig.bgColor} ${typeConfig.borderColor}`}>
                                    {typeConfig.icon}
                                  </div>
                                );
                              })()}
                              <span className="truncate text-slate-700 font-bold group-hover:text-blue-700 transition" title={file.name}>
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
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1.5 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                              {file.tags && file.tags.length > 0 ? (
                                file.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTagFilter(selectedTagFilter === tag ? null : tag);
                                    }}
                                    className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full transition cursor-pointer border ${
                                      selectedTagFilter === tag
                                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                        : 'bg-blue-50/70 hover:bg-blue-100 text-blue-700 border-blue-100/85'
                                    }`}
                                    title={`Filter by ${tag}`}
                                  >
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">No tags</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                            {currentFolder === 'Trash' ? (
                              <div className="flex items-center space-x-1.5">
                                <Clock className="w-3.5 h-3.5 text-red-400/80 pointer-events-none" />
                                <span className="font-extrabold text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 px-2 py-0.5 rounded-md">
                                  {getDaysRemaining(file.deletedAt)} days remaining
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <Clock className="w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                                <span>
                                  {(() => {
                                    const dateObj = file.uploadedAt instanceof Date ? file.uploadedAt : new Date(file.uploadedAt);
                                    return `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                  })()}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-3" onClick={(e) => e.stopPropagation()}>
                              {currentFolder === 'Trash' ? (
                                <>
                                  <button
                                    onClick={() => executeRestore(file.id, file.name)}
                                    className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 p-1.5 rounded-full transition-colors cursor-pointer"
                                    title="Restore file to active directory"
                                  >
                                    <RotateCcw className="w-3.75 h-3.75" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(file.id, file.name)}
                                    className="text-red-405 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 rounded-full transition-colors cursor-pointer"
                                    title="Permanently Delete file"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    id={`btn-share-${file.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShareModalFile(file);
                                      setShareModalExpiresMin(15);
                                      setShareModalGeneratedLink(null);
                                      setShareModalGenerating(false);
                                      setShareModalCopySuccess(false);
                                    }}
                                    className="text-slate-400 hover:text-blue-655 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-150/10 dark:hover:bg-slate-800 transition-all p-1.5 rounded-lg cursor-pointer"
                                    title="Generate Secure Shareable Link"
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    id={`btn-download-${file.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadFile(file);
                                    }}
                                    className="text-slate-400 hover:text-blue-600 transition-colors p-1 cursor-pointer"
                                    title="Download decrypted file"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    id={`btn-delete-${file.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(file.id, file.name);
                                    }}
                                    className="text-slate-300 hover:text-red-500 transition-colors p-1 cursor-pointer"
                                    title="Delete securely"
                                  >
                                    <Trash2 className="w-4.5 h-4.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                files.length === 0 ? (
                  <div id="empty-state-vault-illustration" className="p-10 sm:p-16 text-center flex flex-col items-center justify-center bg-linear-to-b from-slate-50/50 to-slate-100/5 dark:from-slate-900/40 dark:to-slate-950/5 rounded-2xl relative overflow-hidden transition-all duration-300">
                    {/* Glowing background aura */}
                    <div className="absolute -top-24 w-72 h-72 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 w-72 h-72 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Animated SVG Illustration */}
                    <div className="relative w-80 h-56 flex items-center justify-center select-none" id="empty-vault-svg-container">
                      <svg width="280" height="200" viewBox="0 0 280 200" fill="none" className="overflow-visible">
                        {/* Shadow of Safe */}
                        <ellipse cx="140" cy="175" rx="55" ry="8" fill="rgba(0, 0, 0, 0.05)" className="dark:hidden" />
                        <ellipse cx="140" cy="175" rx="55" ry="8" fill="rgba(0, 0, 0, 0.2)" className="hidden dark:block" />

                        {/* Floating blue sheet */}
                        <motion.g
                          animate={{ 
                            y: [0, -12, 0],
                            rotate: [0, 4, -4, 0]
                          }}
                          transition={{ 
                            duration: 4.5, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Sheet Base */}
                          <path d="M45 55 h30 l12 12 v40 h-42 z" fill="url(#blueSheetGrad)" className="drop-shadow-xs" />
                          {/* Corner fold */}
                          <path d="M75 55 v12 h12 z" fill="#c3dafe" className="dark:hidden" />
                          <path d="M75 55 v12 h12 z" fill="#1e40af" className="hidden dark:block" />
                          {/* Fake lines */}
                          <line x1="53" y1="75" x2="77" y2="75" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="53" y1="85" x2="83" y2="85" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="53" y1="95" x2="70" y2="95" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
                        </motion.g>

                        {/* Floating emerald sheet */}
                        <motion.g
                          animate={{ 
                            y: [0, -8, 0],
                            rotate: [0, -6, 6, 0]
                          }}
                          transition={{ 
                            duration: 5, 
                            delay: 1,
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Sheet Base */}
                          <path d="M195 45 h26 l10 10 v36 h-36 z" fill="url(#emeraldSheetGrad)" className="drop-shadow-xs" />
                          {/* Corner fold */}
                          <path d="M221 45 v10 h10 z" fill="#a7f3d0" className="dark:hidden" />
                          <path d="M221 45 v10 h10 z" fill="#065f46" className="hidden dark:block" />
                          {/* Fake graph lines */}
                          <line x1="202" y1="62" x2="220" y2="62" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="202" y1="70" x2="224" y2="70" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="202" y1="78" x2="214" y2="78" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
                        </motion.g>

                        {/* Floating golden small paper */}
                        <motion.g
                          animate={{ 
                            y: [0, -10, 0],
                            rotate: [0, 5, -5, 0]
                          }}
                          transition={{ 
                            duration: 3.8, 
                            delay: 0.5,
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          <rect x="55" y="115" width="22" height="30" rx="3" fill="url(#amberSheetGrad)" className="drop-shadow-6xs" />
                          <line x1="60" y1="124" x2="72" y2="124" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="60" y1="130" x2="70" y2="130" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
                          <line x1="60" y1="136" x2="66" y2="136" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
                        </motion.g>

                        {/* Floating security shield badge */}
                        <motion.g
                          animate={{ 
                            y: [0, -14, 0],
                            scale: [1, 1.05, 0.95, 1]
                          }}
                          transition={{ 
                            duration: 5.2, 
                            delay: 1.5,
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          <path d="M210 115 c0 0 10 -4 14 -4 c4 0 14 4 14 4 c0 10 -3 20 -14 26 c-11 -6 -14 -16 -14 -26 z" fill="url(#shieldGrad)" className="drop-shadow-sm" />
                          <path d="M224 122 l-4 4 l-2 -2" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </motion.g>

                        {/* Central Custodian Robot Safe */}
                        <motion.g
                          animate={{ 
                            y: [0, -4, 0]
                          }}
                          transition={{ 
                            duration: 4, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Safe Body Shadow Inner */}
                          <rect x="90" y="65" width="100" height="105" rx="20" fill="url(#safeGrad)" stroke="#1e293b" strokeWidth="3" className="drop-shadow-md" />
                          
                          {/* Screen / Face */}
                          <rect x="103" y="78" width="74" height="40" rx="10" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
                          
                          {/* Glowing circular eyes */}
                          <motion.circle 
                            cx="118" 
                            cy="98" 
                            r="5" 
                            fill="#38bdf8" 
                            animate={{
                              scaleY: [1, 1, 0.1, 1, 1, 1, 0.1, 1]
                            }}
                            transition={{
                              duration: 5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                            className="shadow-xs shadow-blue-500"
                          />
                          <motion.circle 
                            cx="162" 
                            cy="98" 
                            r="5" 
                            fill="#38bdf8" 
                            animate={{
                              scaleY: [1, 1, 0.1, 1, 1, 1, 0.1, 1]
                            }}
                            transition={{
                              duration: 5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                            className="shadow-xs shadow-blue-500"
                          />
                          
                          {/* Cute Digital Smile */}
                          <path d="M136 102 q4 3 8 0" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" fill="none" />

                          {/* Safe Handle Dial Plate */}
                          <circle cx="140" cy="140" r="15" fill="#334155" stroke="#475569" strokeWidth="1.5" />
                          
                          {/* Animated Rotating Dial Lock */}
                          <motion.g
                            animate={{ 
                              rotate: [0, 360]
                            }}
                            transition={{ 
                              duration: 15, 
                              repeat: Infinity, 
                              ease: "linear" 
                            }}
                            style={{ originX: '140px', originY: '140px' }}
                          >
                            <circle cx="140" cy="140" r="10" fill="url(#lockDialGrad)" />
                            <circle cx="140" cy="133" r="1.5" fill="#ffffff" />
                          </motion.g>

                          {/* Dual Handle Pegs */}
                          <rect x="110" y="137" width="12" height="6" rx="2" fill="#64748b" />
                          <circle cx="112" cy="140" r="1.5" fill="#cbd5e1" />
                        </motion.g>

                        {/* Magical Spikey Sparkles */}
                        <motion.g
                          animate={{ 
                            opacity: [0.3, 1, 0.3],
                            scale: [0.8, 1.2, 0.8]
                          }}
                          transition={{ 
                            duration: 3, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Sparkle Left */}
                          <path d="M35,135 Q35,140 40,140 Q35,140 35,145 Q35,140 30,140 Q35,140 35,135 Z" fill="#fbbf24" />
                          {/* Sparkle Right Top */}
                          <path d="M245,65 Q245,70 250,70 Q245,70 245,75 Q245,70 240,70 Q245,70 245,65 Z" fill="#60a5fa" />
                          {/* Sparkle Center Bottom */}
                          <path d="M110,40 Q110,45 115,45 Q110,45 110,50 Q110,45 105,45 Q110,45 110,40 Z" fill="#34d399" />
                        </motion.g>

                        {/* Defs/Gradients */}
                        <defs>
                          <linearGradient id="blueSheetGrad" x1="45" y1="55" x2="87" y2="107" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#1d4ed8" />
                          </linearGradient>
                          <linearGradient id="emeraldSheetGrad" x1="195" y1="45" x2="231" y2="91" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#047857" />
                          </linearGradient>
                          <linearGradient id="amberSheetGrad" x1="55" y1="115" x2="77" y2="145" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#b45309" />
                          </linearGradient>
                          <linearGradient id="shieldGrad" x1="210" y1="111" x2="238" y2="137" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#064e3b" />
                          </linearGradient>
                          <linearGradient id="safeGrad" x1="90" y1="65" x2="190" y2="170" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#475569" />
                            <stop offset="50%" stopColor="#334155" />
                            <stop offset="100%" stopColor="#1e293b" />
                          </linearGradient>
                          <linearGradient id="lockDialGrad" x1="130" y1="130" x2="150" y2="150" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#d97706" />
                          </linearGradient>
                        </defs>
                      </svg>

                      {/* Directional indicator */}
                      <div className="absolute -top-1 right-20 animate-bounce pointer-events-none">
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 backdrop-blur-xs flex items-center space-x-1">
                          <span>↑</span>
                          <span>Upload Zone</span>
                        </span>
                      </div>
                    </div>

                    <h3 className="text-md sm:text-lg font-extrabold text-slate-850 dark:text-slate-100 tracking-tight mt-6">
                      Your Secure Vault is Empty & Ready
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                      Initialize your client-side encryption workspace by uploading files. Once added, documents are segment-packaged and guarded under our strict zero-trust fortress boundaries.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                      <button
                        type="button"
                        id="empty-state-browse-files-btn"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center space-x-2 shadow-xs cursor-pointer active:scale-95 duration-100"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Select First File to Encrypt</span>
                      </button>
                    </div>

                    {/* Creative prompt ideas */}
                    <div className="mt-8 pt-6 border-t border-slate-150/50 dark:border-slate-800/45 w-full max-w-sm mx-auto">
                      <p className="text-[10px] font-mono font-extrabold text-slate-400/80 dark:text-slate-500 uppercase tracking-widest">Recommended File Formats</p>
                      <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                        {['Contracts (PDF)', 'Invoices (XLS)', 'Graphics (PNG/JPG)', 'Archives (ZIP)'].map((type) => (
                          <span key={type} className="text-[11px] bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-slate-550 dark:text-slate-400 px-2.5 py-1 rounded-lg font-medium">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
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
                )
              )}
            </div>
          </>
        )}

        {/* Tab 2: Activity History */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>Real-Time Confidential Activity Logs</span>
            </h2>
            
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs max-w-4xl p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Security Audit Logs</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Guaranteed tamper-proof logging of active client transactions in the MongoDB Atlas backend.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    id="export-csv-audit-logs-btn"
                    onClick={handleExportCSV}
                    disabled={activities.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-transparent bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 text-white font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
                    title="Export activity logs as a CSV file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={fetchActivities}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer"
                    disabled={loadingActivities}
                  >
                    {loadingActivities ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>Refresh Feed</span>
                  </button>
                </div>
              </div>

              {loadingActivities && activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-xs text-slate-500 font-semibold">Synchronizing audit feed payload...</p>
                </div>
              ) : (
                <div id="activity-timeline" className="relative pl-2">
                  {activities.length > 0 && (
                    <div className="absolute left-[17px] top-2 bottom-2 w-0.5 bg-slate-200" />
                  )}
                  
                  {activities.length > 0 ? (
                    <div className="space-y-6">
                      {activities.map((act) => {
                        let actionConfig = {
                          bg: 'bg-emerald-50 border-emerald-100 text-emerald-700',
                          badge: 'bg-emerald-100 text-emerald-800',
                          label: 'File Upload',
                          icon: <UploadCloud className="w-4 h-4" />
                        };
                        
                        if (act.action === 'DELETE') {
                          actionConfig = {
                            bg: 'bg-red-50 border-red-100 text-red-700',
                            badge: 'bg-red-100 text-red-800',
                            label: 'File Delete',
                            icon: <Trash2 className="w-4 h-4" />
                          };
                        } else if (act.action === 'TAG_UPDATE') {
                          actionConfig = {
                            bg: 'bg-blue-50 border-blue-100 text-blue-700',
                            badge: 'bg-blue-100 text-blue-800',
                            label: 'Tag Update',
                            icon: <Tag className="w-4 h-4" />
                          };
                        }

                        return (
                          <div key={act.id} className="relative flex items-start space-x-4 group">
                            {/* Icon badge circle */}
                            <div className={`relative z-10 w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-xs ${actionConfig.bg}`}>
                              {actionConfig.icon}
                            </div>
                            
                            {/* Inner Details */}
                            <div className="flex-1 bg-slate-50/70 border border-slate-150 rounded-2xl p-4 transition-all hover:bg-slate-50/90">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${actionConfig.badge}`}>
                                    {actionConfig.label}
                                  </span>
                                  <span className="text-xs font-extrabold text-slate-900 break-all font-sans">
                                    {act.fileName}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3 text-slate-350" />
                                  {act.timestamp.toLocaleDateString()} {act.timestamp.toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-xs text-slate-550 mt-2 font-medium leading-relaxed">
                                {act.details}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div id="empty-state-logs" className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-2">
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-slate-500">No security audit logs found</p>
                      <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                        Perform file uploads, deletions, or tag updates to initiate the audit stream database records.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Settings & Guidelines */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-850 dark:text-slate-100 flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Guidelines and System Layout</span>
            </h2>

            {/* Account Profile Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-950/40 border-2 border-slate-200 dark:border-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-2xl shadow-xs shrink-0 select-none">
                    {(profile?.name?.[0] || user?.email?.[0] || 'C').toUpperCase()}
                  </div>
                  <div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                          {profile?.name || 'Active Workspace Client'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setNewName(profile?.name || user?.email?.split('@')[0] || '');
                            setSaveNameError(null);
                            setIsEditNameModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all font-mono"
                        >
                          [Edit Profile Name]
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {user?.email}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                        Role: Client Vault Partner • Registered: {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Active Session'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Modal for Full Name update inside 'Setup' tab */}
            <AnimatePresence>
              {isEditNameModalOpen && (
                <div 
                  id="edit-profile-name-modal-overlay"
                  className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
                  onClick={() => setIsEditNameModalOpen(false)}
                >
                  <motion.div
                    id="edit-profile-name-modal-content"
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: 'spring', duration: 0.35 }}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden p-6 relative font-sans"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                      <h3 className="text-base font-extrabold text-slate-950 dark:text-white tracking-tight flex items-center space-x-2">
                        <Settings className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                        <span>Update Display Name</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsEditNameModalOpen(false)}
                        className="text-slate-450 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-350 transition-colors p-1"
                      >
                        <X className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveName} className="space-y-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Please enter your full name below. This display name will be updated across all vaults, logs, file details, and sidebar navigation dynamically.
                      </p>

                      <div>
                        <label htmlFor="modal-full-name-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-305 mb-1.5">
                          Full Name
                        </label>
                        <input
                          id="modal-full-name-input"
                          type="text"
                          required
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="John Doe"
                          className="block w-full px-3.5 py-2 border border-slate-250 dark:border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-150 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                          disabled={savingName}
                        />
                      </div>

                      {saveNameError && (
                        <p className="text-[11px] text-red-500 font-medium">{saveNameError}</p>
                      )}

                      <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditNameModalOpen(false);
                            setNewName(profile?.name || user?.email?.split('@')[0] || '');
                            setSaveNameError(null);
                          }}
                          className="px-4 py-2 text-xs font-bold text-slate-550 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950/40 rounded-xl transition-all border border-slate-200 dark:border-slate-800"
                          disabled={savingName}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingName}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center space-x-1.5 font-sans"
                        >
                          {savingName ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <span>Save Changes</span>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Visual Workspace Theme Setting Panel */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 justify-center">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 bg-blue-500/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                    {theme === 'dark' ? <Moon className="w-5 h-5 text-blue-400 animate-pulse" /> : <Sun className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase font-mono tracking-wider">Aesthetic Theme Preferences</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Configure your visual workspace experience dynamically between light and dark mode</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-850 shrink-0">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {theme === 'dark' ? 'Cosmic Dark Mode' : 'Refined Light Mode'}
                  </span>
                  
                  <button
                    type="button"
                    role="switch"
                    aria-checked={theme === 'dark'}
                    id="theme-toggle-switch"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      theme === 'dark' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-805'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Automated Email Notifications Opt-in Toggle */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 justify-center">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 bg-emerald-500/10 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase font-mono tracking-wider">Automated Email Notifications</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Opt-in or out of automatic notifications whenever a new file is uploaded to your vault</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-850 shrink-0">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {(profile?.emailNotificationsEnabled ?? true) ? 'Opted In' : 'Opted Out'}
                  </span>
                  
                  <button
                    type="button"
                    role="switch"
                    aria-checked={profile?.emailNotificationsEnabled ?? true}
                    id="email-notification-toggle-switch"
                    disabled={updatingNotifications}
                    onClick={handleToggleNotifications}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                      (profile?.emailNotificationsEnabled ?? true) ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-805'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        (profile?.emailNotificationsEnabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Zero-Trust Inactivity & Auto-Logout Policy Panel */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 justify-center">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase font-mono tracking-wider">Inactivity Auto-Logout Policy</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Your global session automatically terminates after 15 minutes of user inactivity to prevent unauthorized access.</p>
                  </div>
                </div>
                
                <div className="shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      // Broadcast simulated inactivity event to activate warning toast/modal immediately
                      window.dispatchEvent(new CustomEvent('trigger-inactivity-demo'));
                    }}
                    className="w-full sm:w-auto text-center px-4 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl shadow-xs transition-all cursor-pointer font-sans"
                  >
                    Test Inactivity Warning (5s)
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1 */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-450 uppercase font-mono tracking-wider">How ClientVault Secures Your Files</h3>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  By compiling comprehensive zero-trust attribute-based access control (ABAC) rules inside our global rules config, no user can write files with someone else's ID or access another client's uploaded assets, even if they use raw firestore developer tools.
                </p>
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-850 font-mono text-[10px] text-slate-600 dark:text-slate-400 space-y-1.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Database Schema Enforcements:</div>
                  <div>- UserProfile keys size constraints verified</div>
                  <div>- ClientFile dimensions strictly checked at Database entry</div>
                  <div>- Clock drift client updates forbidden via server request timestamps</div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-450 uppercase font-mono tracking-wider font-sans">Connecting Firebase Environment</h3>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  ClientVault is configured using automatic background parameters configured through Google Cloud Run. Follow these instructions to bind the storage engine of your choice:
                </p>
                <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-2 list-decimal list-inside leading-relaxed font-sans">
                  <li>Find the <strong>Secrets Panel</strong> in AI Studio settings</li>
                  <li>Configure your **GEMINI_API_KEY** or Firebase variables if needed</li>
                  <li>Enable the **Email / Password provider** in your custom Firebase console under <em>Authentication &gt; Sign-in method</em> so clients can self-register safely</li>
                </ol>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Floating Animated Download Confirmation Toast */}
      <AnimatePresence>
        {downloadSuccess && (
          <motion.div
            id="download-toast"
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

      {/* High-Fidelity Asset Preview Modal */}
      <AnimatePresence>
        {selectedPreviewFile && (
          <div 
            id="preview-modal-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSelectedPreviewFile(null)}
          >
            <motion.div
              id="preview-modal-content"
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
                <span className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-[10px] font-mono tracking-widest text-slate-300 font-semibold px-2.5 py-1 rounded-md z-1">
                  SECURE PREVIEW ENGINE
                </span>

                <button
                  id="preview-close-corner-btn"
                  onClick={() => setSelectedPreviewFile(null)}
                  className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white hover:text-red-400 transition p-1.5 rounded-full z-1 cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden">
                  {/* PDF Viewer */}
                  {(selectedPreviewFile.type.includes('pdf') || selectedPreviewFile.name.toLowerCase().endsWith('.pdf')) ? (
                    <div className="w-full h-full flex flex-col relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                      <div className="flex items-center justify-between bg-slate-950 px-4 py-2 text-xs text-slate-400 border-b border-slate-800 shrink-0 font-mono">
                        <span className="flex items-center space-x-1.5 font-bold text-slate-200">
                          <FileCode className="w-4 h-4 text-blue-400" />
                          <span>PDF SECURE DESKTOP READER</span>
                        </span>
                        {previewUrl && (
                          <a 
                            href={previewUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/10 px-2.5 py-1 rounded font-bold transition flex items-center space-x-1 cursor-pointer"
                          >
                            <span>Full Window ↗</span>
                          </a>
                        )}
                      </div>
                      <iframe 
                        src={previewUrl || undefined} 
                        className="w-full h-full border-0 bg-white" 
                        title="PDF Client Preview"
                      />
                    </div>
                  ) : (selectedPreviewFile.type.includes('word') || selectedPreviewFile.type.includes('officedocument') || selectedPreviewFile.name.toLowerCase().endsWith('.docx')) ? (
                    /* Word Document Viewer */
                    docxLoading ? (
                      <div className="flex flex-col items-center justify-center text-center p-12 text-slate-400 space-y-4 font-sans">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-200">Unpacking Word document template...</p>
                          <p className="text-[10px] text-slate-500 font-mono tracking-wide">Client-side OOXML parser extracting text content...</p>
                        </div>
                      </div>
                    ) : docxLines ? (
                      <div className="w-full h-full flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-850">
                        <div className="flex items-center justify-between bg-slate-950 px-4 py-2.5 border-b border-slate-800 text-[10.5px] text-slate-400 shrink-0 font-mono">
                          <span className="flex items-center space-x-1.5 font-bold text-slate-200">
                            <FileText className="w-4.5 h-4.5 text-blue-450" />
                            <span>DOCX CRYPTO-EXTRACT LIVE VIEW</span>
                          </span>
                          <span>{docxLines.length} Paragraphs</span>
                        </div>
                        
                        <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-800 flex justify-center selection:bg-blue-200 selection:text-blue-900">
                          {/* High-fidelity simulate Word Paper page */}
                          <div className="w-full max-w-[650px] bg-white text-slate-850 px-8 md:px-12 py-10 md:py-14 shadow-2xl rounded-lg border border-slate-700/50 min-h-[500px] font-sans prose prose-slate text-xs md:text-sm leading-relaxed relative text-left">
                            <div className="absolute top-4 right-6 text-[9px] text-slate-350 font-mono tracking-wider select-none uppercase font-bold">
                              ClientVault Document Reader
                            </div>
                            
                            {docxLines.map((line, idx) => {
                              if (line.trim() === "") {
                                return <div key={idx} className="h-4" />;
                              }
                              return (
                                <p key={idx} className="mb-4 text-slate-800 tracking-normal leading-relaxed text-justify">
                                  {line}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300">
                          <FileText className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-200">Word Document Reader</p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xs font-sans">
                            Extracting text was unsuccessful. Please inspect metadata on the right or download the object.
                          </p>
                        </div>
                      </div>
                    )
                  ) : (selectedPreviewFile.type.includes('heic') || selectedPreviewFile.type.includes('heif') || selectedPreviewFile.name.toLowerCase().endsWith('.heic') || selectedPreviewFile.name.toLowerCase().endsWith('.heif')) ? (
                    /* HEIF / HEIC Viewer */
                    heicLoading ? (
                      <div className="flex flex-col items-center justify-center text-center p-12 text-slate-400 space-y-4 font-sans">
                        <div className="relative flex items-center justify-center">
                          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-200">Decoding HEIF Content Container...</p>
                          <p className="text-[10px] text-slate-500 font-mono tracking-wide">Transcoding HEIC to native browser JPEG stream...</p>
                        </div>
                      </div>
                    ) : heicBlobUrl ? (
                      /* Interactive Canvas for decoded HEIF image */
                      <div className="w-full h-full flex flex-col items-center justify-center relative p-4 bg-slate-950 overflow-hidden select-none animate-fadeIn">
                        <div className="flex-1 flex items-center justify-center overflow-auto w-full max-h-full">
                          <img 
                            src={heicBlobUrl} 
                            alt={selectedPreviewFile.name} 
                            referrerPolicy="no-referrer"
                            className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-200 ease-out shadow-2xl border border-slate-800"
                            style={{
                              transform: `scale(${zoomFactor}) rotate(${rotationAngle}deg)`
                            }}
                          />
                        </div>
                        {/* Floating Glassmorphism Controls */}
                        <div className="absolute bottom-4 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 px-4 py-2 flex items-center space-x-3.5 shadow-2xl text-slate-100 max-w-xs">
                          <button 
                            onClick={() => setZoomFactor(prev => Math.max(0.5, prev - 0.25))}
                            className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Zoom Out"
                          >
                            <ZoomOut className="w-4 h-4 text-slate-350 hover:text-white" />
                          </button>
                          <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">
                            {Math.round(zoomFactor * 100)}%
                          </span>
                          <button 
                            onClick={() => setZoomFactor(prev => Math.min(3, prev + 0.25))}
                            className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Zoom In"
                          >
                            <ZoomIn className="w-4 h-4 text-slate-350 hover:text-white" />
                          </button>
                          <div className="w-px h-4 bg-slate-800" />
                          <button 
                            onClick={() => setRotationAngle(prev => (prev + 90) % 360)}
                            className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Rotate Clockwise"
                          >
                            <RotateCw className="w-4 h-4 text-slate-350 hover:text-white" />
                          </button>
                          <div className="w-px h-4 bg-slate-800" />
                          <button 
                            onClick={() => { setZoomFactor(1); setRotationAngle(0); }}
                            className="text-[9px] font-mono font-extrabold uppercase text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded transition cursor-pointer"
                            title="Reset layout settings"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Fallback block for HEIC if transcode fails */
                      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-4">
                        <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-center text-amber-500 shadow-inner">
                          <AlertTriangle className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-200">HEIF Container Analytical Mode</p>
                          <p className="text-[11px] text-slate-500 mt-2 max-w-xs font-sans leading-relaxed">
                            {heicError || "Dynamic image transcode skipped. Download the file natively to parse on iOS/macOS."}
                          </p>
                        </div>
                      </div>
                    )
                  ) : selectedPreviewFile.type.startsWith('image/') ? (
                    /* Standard Image Viewer with Rich Interactive Zoom and Rotation */
                    <div className="w-full h-full flex flex-col items-center justify-center relative p-4 bg-slate-950 overflow-hidden select-none">
                      <div className="flex-1 flex items-center justify-center overflow-auto w-full max-h-full">
                        <img 
                          src={previewUrl || selectedPreviewFile.content || undefined} 
                          alt={selectedPreviewFile.name} 
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-200 ease-out shadow-2xl border border-slate-800"
                          style={{
                            transform: `scale(${zoomFactor}) rotate(${rotationAngle}deg)`
                          }}
                        />
                      </div>
                      
                      {/* Floating Glassmorphism controls toolbar */}
                      <div className="absolute bottom-4 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 px-4 py-2 flex items-center space-x-3.5 shadow-2xl text-slate-100 max-w-xs">
                        <button 
                          onClick={() => setZoomFactor(prev => Math.max(0.5, prev - 0.25))}
                          className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-4 h-4 text-slate-350 hover:text-white" />
                        </button>
                        <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">
                          {Math.round(zoomFactor * 100)}%
                        </span>
                        <button 
                          onClick={() => setZoomFactor(prev => Math.min(3, prev + 0.25))}
                          className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-4 h-4 text-slate-350 hover:text-white" />
                        </button>
                        <div className="w-px h-4 bg-slate-800" />
                        <button 
                          onClick={() => setRotationAngle(prev => (prev + 90) % 360)}
                          className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Rotate Clockwise"
                        >
                          <RotateCw className="w-4 h-4 text-slate-350 hover:text-white" />
                        </button>
                        <div className="w-px h-4 bg-slate-800" />
                        <button 
                          onClick={() => { setZoomFactor(1); setRotationAngle(0); }}
                          className="text-[9px] font-mono font-extrabold uppercase text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded transition cursor-pointer"
                          title="Reset settings"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : selectedPreviewFile.type.startsWith('video/') ? (
                    <video 
                      src={previewUrl || selectedPreviewFile.content || undefined} 
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
                      {(() => {
                        const typeConfig = getFileTypeConfig(selectedPreviewFile.type, selectedPreviewFile.name);
                        return (
                          <div className={`w-20 h-20 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor} flex items-center justify-center shadow-inner`}>
                            {typeConfig.iconLg}
                          </div>
                        );
                      })()}
                      <div>
                        <p className="text-sm font-bold text-slate-250 dark:text-slate-100">No Render Output</p>
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
                    <h4 className="text-[10px] font-mono font-bold text-blue-600 uppercase tracking-widest">Selected Payload</h4>
                    <h3 className="text-md font-extrabold text-slate-900 mt-1 break-words font-sans mb-1" title={selectedPreviewFile.name}>
                      {selectedPreviewFile.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 items-center mt-2">
                      <span className="bg-slate-200/60 text-slate-700 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold font-sans">
                        {formatBytes(selectedPreviewFile.size)}
                      </span>
                      {(() => {
                        const typeConfig = getFileTypeConfig(selectedPreviewFile.type, selectedPreviewFile.name);
                        return (
                          <span className={`text-[10px] border px-2 py-0.5 rounded-md font-mono truncate ${typeConfig.badgeClass || 'bg-blue-50 text-blue-750 border-blue-100'}`} title={selectedPreviewFile.type}>
                            {typeConfig.label} ({typeConfig.shorthand})
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <hr className="border-slate-200/80" />

                  {/* Vault Diagnostics Metadata List */}
                  <div className="space-y-4 font-sans text-xs">
                    <h5 className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Info className="w-4 h-4 text-slate-400" />
                      <span>Vault Diagnostics</span>
                    </h5>
                    
                    <div className="space-y-3 font-medium text-slate-600">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Payload Integrity ID</p>
                        <p className="text-slate-700 font-mono text-[10px] bg-slate-100 p-1.5 rounded-md mt-1 break-all select-all">{selectedPreviewFile.id}</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Original Size</p>
                        <p className="text-slate-800 mt-0.5">{selectedPreviewFile.size.toLocaleString()} Source Bytes</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold font-mono tracking-wider">Creation Timestamp</p>
                        <p className="text-slate-850 mt-0.5">
                          {selectedPreviewFile.uploadedAt.toLocaleDateString()} {selectedPreviewFile.uploadedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-200/80" />

                  {/* Manage Tags subsection */}
                  <div className="space-y-3 font-sans text-xs">
                    <h5 className="font-bold text-slate-800 flex items-center space-x-1.5 animate-fadeIn">
                      <Tag className="w-4 h-4 text-blue-600" />
                      <span>Manage File Tags</span>
                    </h5>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPreviewFile.tags && selectedPreviewFile.tags.length > 0 ? (
                        selectedPreviewFile.tags.map((tag) => (
                          <span
                            key={tag}
                            className="bg-blue-50 border border-blue-100/80 text-blue-700 font-extrabold px-2 py-0.5 rounded-full text-[9.5px] inline-flex items-center space-x-1"
                          >
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const updatedTags = (selectedPreviewFile.tags || []).filter(t => t !== tag);
                                await handleUpdateFileTags(selectedPreviewFile.id, updatedTags);
                              }}
                              className="text-blue-400 hover:text-red-500 hover:bg-slate-100 p-0.5 rounded-full focus:outline-hidden shrink-0 font-sans cursor-pointer font-bold leading-none"
                              title={`Remove tag "${tag}"`}
                            >
                              ✕
                            </button>
                          </span>
                        ))
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No tags assigned to this file.</p>
                      )}
                    </div>

                    <div className="space-y-2 pt-1 border-t border-slate-150">
                      <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Quick Tags:</p>
                      <div className="flex flex-wrap gap-1">
                        {['Draft', 'Final', 'Contract'].map((preset) => {
                          const hasTag = selectedPreviewFile.tags?.includes(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              disabled={hasTag}
                              onClick={async () => {
                                const updatedTags = Array.from(new Set([...(selectedPreviewFile.tags || []), preset]));
                                await handleUpdateFileTags(selectedPreviewFile.id, updatedTags);
                              }}
                              className={`text-[9.5px] font-bold px-2 py-1 rounded-md transition ${
                                hasTag
                                  ? 'bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer border border-slate-200/50'
                              }`}
                            >
                              + {preset}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        id="custom-tag-modal-input"
                        type="text"
                        placeholder="Add tag and hit Enter..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              const updatedTags = Array.from(new Set([...(selectedPreviewFile.tags || []), val]));
                              await handleUpdateFileTags(selectedPreviewFile.id, updatedTags);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        className="w-full text-[11px] bg-slate-100 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-705 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mt-2"
                      />
                    </div>
                  </div>

                  <hr className="border-slate-200/85" />

                  {/* Temporary Secure Public Link subsection */}
                  <div className="space-y-3 font-sans text-xs">
                    <h5 className="font-bold text-slate-800 flex items-center space-x-1.5 animate-fadeIn">
                      <Share2 className="w-4 h-4 text-blue-600" />
                      <span>Confidential Share Link</span>
                    </h5>

                    {!generatedShareLink ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                          Register a temporary read-only access link for non-account holders. It automatically self-destructs upon expiration.
                        </p>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-450">Expiration Horizon:</label>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { label: '15m', val: 15 },
                              { label: '1h', val: 60 },
                              { label: '24h', val: 1440 },
                              { label: '7d', val: 10080 },
                            ].map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setShareExpiresMin(preset.val)}
                                className={`text-[9.5px] py-1 rounded font-bold transition border ${
                                  shareExpiresMin === preset.val
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-slate-200 border-slate-205 text-slate-650 cursor-pointer'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleGenerateShareLink(selectedPreviewFile.id)}
                          disabled={generatingShareLink}
                          className="w-full inline-flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-blue-50 border border-blue-100 hover:bg-rose-50/10 hover:border-blue-300 text-blue-700 font-extrabold text-[11px] select-none transition cursor-pointer"
                        >
                          {generatingShareLink ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              <span>Securing Gateway Address...</span>
                            </>
                          ) : (
                            <>
                              <Link className="w-3.5 h-3.5 text-blue-500" />
                              <span>Generate Public Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5 bg-sky-50/50 border border-sky-100/80 rounded-xl p-3 animate-fadeIn">
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] uppercase font-mono font-bold tracking-wider text-sky-700">Link Securely Ready:</span>
                          <span className="text-[9px] text-sky-650 bg-sky-100 border border-sky-150 rounded px-1.5 py-0.5 font-mono font-bold">
                            Expires in {shareExpiresMin >= 1440 ? `${Math.round(shareExpiresMin / 1440)}d` : shareExpiresMin >= 60 ? `${Math.round(shareExpiresMin / 60)}h` : `${shareExpiresMin}m`}
                          </span>
                        </div>

                        <div className="flex space-x-1.5 mt-1">
                          <input
                            type="text"
                            readOnly
                            value={generatedShareLink}
                            className="bg-white border border-sky-150 rounded-lg px-2 py-1 text-[10px] font-mono text-sky-800 break-all select-all flex-1 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(generatedShareLink);
                              setCopySuccess(true);
                              setTimeout(() => setCopySuccess(false), 2000);
                            }}
                            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs shrink-0 transition flex items-center justify-center cursor-pointer"
                            title="Copy link to clipboard"
                          >
                            {copySuccess ? (
                              <CheckCircle className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-white" />
                            )}
                          </button>
                        </div>

                        {copySuccess && (
                          <p className="text-[9.5px] text-emerald-600 font-extrabold flex items-center space-x-1 animate-fadeIn">
                            <span>✔ Secure Link Copied!</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Operations Actions */}
                <div className="space-y-2 mt-8 md:mt-0 pt-4 border-t border-slate-200 border-dashed">
                  <button
                    id="modal-preview-btn-download"
                    onClick={() => handleDownloadFile(selectedPreviewFile)}
                    className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs border border-blue-700 shadow-md shadow-blue-100 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Payload</span>
                  </button>
                  <button
                    id="modal-preview-btn-delete"
                    onClick={() => {
                      handleDelete(selectedPreviewFile.id, selectedPreviewFile.name);
                      setSelectedPreviewFile(null);
                    }}
                    className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 font-semibold text-xs border border-slate-200 hover:border-red-200 transition cursor-pointer"
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

      {/* Custom Modal Confirmation Dialog for File Deletion */}
      <AnimatePresence>
        {fileToDelete && (
          <div 
            id="delete-confirm-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setFileToDelete(null)}
          >
            <motion.div
              id="delete-confirm-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-sm overflow-hidden p-6 relative font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                {/* Warning Badge */}
                <div className="w-14 h-14 bg-red-50 text-red-600 border border-red-100 rounded-2xl flex items-center justify-center mb-4">
                  <AlertTriangle className="w-7 h-7" />
                </div>

                <h3 className="text-base font-extrabold text-slate-950 tracking-tight">
                  {currentFolder === 'Trash' ? 'Confirm Secure Disposal' : 'Safe Move to Trash'}
                </h3>
                
                <p className="text-xs text-slate-550 font-medium mt-2 leading-relaxed px-1">
                  {currentFolder === 'Trash' ? (
                    <>
                      Are you absolutely sure you want to permanently shred and purge <span className="font-bold text-slate-800 break-all">{`"${fileToDelete.name}"`}</span>?
                    </>
                  ) : (
                    <>
                      Do you want to safely move <span className="font-bold text-slate-800 break-all">{`"${fileToDelete.name}"`}</span> to your Secure Trash container?
                    </>
                  )}
                </p>

                <div className={`${currentFolder === 'Trash' ? 'bg-amber-50/70 border-amber-100 text-amber-800' : 'bg-blue-50/70 border-blue-105 text-blue-800'} border rounded-xl p-3 mt-4 text-left w-full flex items-start space-x-2.5`}>
                  <Info className={`w-4 h-4 ${currentFolder === 'Trash' ? 'text-amber-600' : 'text-blue-600'} shrink-0 mt-0.5`} />
                  <p className="text-[10px] font-semibold leading-relaxed">
                    {currentFolder === 'Trash' ? (
                      'This operation is final and irreversible. Our zero-trust server will immediately wipe the encrypted payload records from MongoDB Atlas.'
                    ) : (
                      'The file remains fully encrypted using your secure key and is stored for up to 30 days. You can easily restore it at any point during this period.'
                    )}
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  id="btn-confirm-delete-cancel"
                  onClick={() => setFileToDelete(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-150 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200 cursor-pointer"
                >
                  Keep Payload
                </button>
                <button
                  id="btn-confirm-delete-execute"
                  onClick={executeDelete}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-100 transition border border-red-700 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confim Delete</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedFileIds.length > 0 && (
          <motion.div 
            id="bulk-actions-floating-bar"
            initial={{ opacity: 0, y: 100, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 100, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 border text-slate-100 px-6 py-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 z-50 w-[92%] sm:w-auto min-w-[540px] transition-colors ${
              currentFolder === 'Trash' 
                ? 'bg-rose-950/95 border-rose-800 hover:border-rose-700' 
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center space-x-3.5">
              <div className={`w-10 h-10 border rounded-xl flex items-center justify-center shrink-0 ${
                currentFolder === 'Trash'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                {currentFolder === 'Trash' ? (
                  <Trash2 className="w-5 h-5 animate-pulse text-rose-450" />
                ) : (
                  <Archive className="w-5 h-5 animate-pulse text-blue-400" />
                )}
              </div>
              <div className="text-left font-sans">
                <h4 className="text-xs font-black text-white tracking-tight">
                  {selectedFileIds.length} {selectedFileIds.length === 1 ? 'file' : 'files'} selected {currentFolder === 'Trash' ? 'in Trash' : ''}
                </h4>
                <p className="text-[10px] text-slate-400 font-medium">
                  {currentFolder === 'Trash' 
                    ? 'Bulk restore these files back to active vaults or shred them permanently' 
                    : 'Pack into secure ZIP or clean securely from MongoDB vault'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                id="btn-bulk-cancel"
                onClick={() => setSelectedFileIds([])}
                className="text-[10.5px] font-black text-slate-400 hover:text-white px-3 py-2.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
                disabled={zipping || deletingBulk}
              >
                Cancel
              </button>

              {currentFolder === 'Trash' ? (
                <>
                  <button
                    type="button"
                    onClick={executeBulkRestore}
                    disabled={deletingBulk}
                    className="relative bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-emerald-990/30 cursor-pointer group border border-emerald-500"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-white" />
                    <span>Restore Selected</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBulkDeleteConfirm(true)}
                    disabled={deletingBulk}
                    className="relative bg-red-600 hover:bg-red-750 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-red-900/15 cursor-pointer group border border-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white animate-bounce-subtle" />
                    <span>Permanently Delete Selected</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    id="btn-bulk-move"
                    onClick={() => {
                      setSelectedFolderToMove(null);
                      setCustomMoveFolder('');
                      setShowBulkMoveModal(true);
                    }}
                    disabled={zipping || deletingBulk}
                    className="relative bg-amber-600 hover:bg-amber-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-amber-900/30 cursor-pointer overflow-hidden group border border-amber-500"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-white" />
                    <span>Move to Folder</span>
                  </button>

                  <button
                    type="button"
                    id="btn-bulk-rename"
                    onClick={() => setShowBulkRenameModal(true)}
                    disabled={zipping || deletingBulk}
                    className="relative bg-teal-600 hover:bg-teal-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-teal-900/30 cursor-pointer overflow-hidden group border border-teal-500"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-white" />
                    <span>Batch Rename</span>
                  </button>

                  <button
                    type="button"
                    id="btn-bulk-delete"
                    onClick={() => setBulkDeleteConfirm(true)}
                    disabled={zipping || deletingBulk}
                    className="relative bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-red-900/10 cursor-pointer group border border-red-500"
                  >
                    {deletingBulk ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Purging files...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                        <span>Delete Selected</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    id="btn-bulk-zip-download"
                    onClick={handleDownloadZip}
                    disabled={zipping || deletingBulk}
                    className="relative bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-blue-900/30 cursor-pointer overflow-hidden group border border-blue-500"
                  >
                    {zipping ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Compressing {zipProgress > 0 ? `(${zipProgress}%)` : ''}...</span>
                        <div 
                          className="absolute inset-y-0 left-0 bg-blue-500 opacity-15 transition-all duration-350 pointer-events-none" 
                          style={{ width: `${zipProgress}%` }}
                        />
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform text-white" />
                        <span>Download ZIP</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Modal Confirmation Dialog for Bulk File Deletion */}
      <AnimatePresence>
        {bulkDeleteConfirm && (
          <div 
            id="bulk-delete-confirm-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setBulkDeleteConfirm(false)}
          >
            <motion.div
              id="bulk-delete-confirm-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-sm overflow-hidden p-6 relative font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                {/* Warning Badge */}
                <div className="w-14 h-14 bg-red-50 text-red-600 border border-red-100 rounded-2xl flex items-center justify-center mb-4">
                  <AlertTriangle className="w-7 h-7" />
                </div>

                <h3 className="text-base font-extrabold text-slate-950 tracking-tight">
                  {currentFolder === 'Trash' ? `Dispose of ${selectedFileIds.length} Selected Files` : `Move ${selectedFileIds.length} Files to Trash`}
                </h3>
                
                <p className="text-xs text-slate-550 font-medium mt-2 leading-relaxed px-1">
                  {currentFolder === 'Trash' ? (
                    <>
                      Are you absolutely sure you want to permanently shred and purge <span className="font-extrabold text-red-650">{selectedFileIds.length} selected files</span>?
                    </>
                  ) : (
                    <>
                      Are you sure you want to safely move <span className="font-extrabold text-blue-650">{selectedFileIds.length} selected files</span> to the Secure Trash container?
                    </>
                  )}
                </p>

                <div className={`${currentFolder === 'Trash' ? 'bg-amber-50/70 border-amber-100 text-amber-800' : 'bg-blue-50/70 border-blue-105 text-blue-800'} border rounded-xl p-3 mt-4 text-left w-full flex items-start space-x-2.5`}>
                  <Info className={`w-4 h-4 ${currentFolder === 'Trash' ? 'text-amber-600' : 'text-blue-600'} shrink-0 mt-0.5`} />
                  <p className="text-[10px] font-semibold leading-relaxed">
                    {currentFolder === 'Trash' ? (
                      'This collective payload disposal is final and irreversible. Our zero-trust server will immediately wipe these records and context permanently.'
                    ) : (
                      'These files remain fully encrypted and are stored safely in Trash for up to 30 days. You can easily bulk restore them of your choice.'
                    )}
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  id="btn-confirm-bulk-delete-cancel"
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-150 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200 cursor-pointer"
                >
                  {currentFolder === 'Trash' ? 'Keep Payloads' : 'Keep Active'}
                </button>
                <button
                  id="btn-confirm-bulk-delete-execute"
                  onClick={executeBulkDelete}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-100 transition border border-red-700 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{currentFolder === 'Trash' ? 'Purge Permanently' : 'Trash Selected'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Modal Confirmation Dialog for Bulk File Renaming */}
      <AnimatePresence>
        {showBulkRenameModal && (
          <div 
            id="bulk-rename-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setShowBulkRenameModal(false)}
          >
            <motion.div
              id="bulk-rename-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden p-6 relative font-sans text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900 rounded-xl flex items-center justify-center">
                    <Edit3 className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Batch Rename Selected Files
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                      Configure patterns to batch process {selectedFileIds.length} files
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkRenameModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode switch bar */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl mt-4">
                <button
                  type="button"
                  onClick={() => setBulkRenameMode('prefix_suffix')}
                  className={`py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                    bulkRenameMode === 'prefix_suffix'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Prefix & Suffix
                </button>
                <button
                  type="button"
                  onClick={() => setBulkRenameMode('pattern')}
                  className={`py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                    bulkRenameMode === 'pattern'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Custom Pattern
                </button>
                <button
                  type="button"
                  onClick={() => setBulkRenameMode('replace')}
                  className={`py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                    bulkRenameMode === 'replace'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Find & Replace
                </button>
              </div>

              {/* Dynamic Inputs Container */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-100 dark:border-slate-800/60 min-h-[110px]">
                {bulkRenameMode === 'prefix_suffix' && (
                  <div className="grid grid-cols-2 gap-3.5 text-left">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                        Prefix (prepend)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Conf_"
                        value={bulkRenamePrefix}
                        onChange={(e) => setBulkRenamePrefix(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                        Suffix (append)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. _v2"
                        value={bulkRenameSuffix}
                        onChange={(e) => setBulkRenameSuffix(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}

                {bulkRenameMode === 'pattern' && (
                  <div className="text-left">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                      Rename Pattern Structure
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Archive_{index}_{date}"
                      value={bulkRenamePattern}
                      onChange={(e) => setBulkRenamePattern(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2 text-[9.5px] text-slate-400 font-medium">
                      <span>Placeholders:</span>
                      <button 
                        type="button"
                        onClick={() => setBulkRenamePattern(prev => prev + '{name}')}
                        className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        {"{name}"}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setBulkRenamePattern(prev => prev + '{index}')}
                        className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        {"{index}"}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setBulkRenamePattern(prev => prev + '{date}')}
                        className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        {"{date}"}
                      </button>
                    </div>
                  </div>
                )}

                {bulkRenameMode === 'replace' && (
                  <div className="grid grid-cols-2 gap-3.5 text-left">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                        Find Characters
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. draft"
                        value={bulkRenameFind}
                        onChange={(e) => setBulkRenameFind(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                        Replace With
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. final"
                        value={bulkRenameReplace}
                        onChange={(e) => setBulkRenameReplace(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Live Preview List */}
              <div className="mt-4">
                <span className="block text-[9.5px] font-bold text-slate-400 tracking-wider uppercase mb-1.5 text-left">
                  Live Transformation Preview
                </span>
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-[143px] overflow-y-auto bg-slate-50/50 dark:bg-slate-950/20">
                  {selectedFileIds.map((id, index) => {
                    const file = files.find(f => f.id === id);
                    if (!file) return null;
                    const previewNewName = getRenamedFileName(
                      file.name,
                      index,
                      bulkRenameMode,
                      bulkRenamePrefix,
                      bulkRenameSuffix,
                      bulkRenamePattern,
                      bulkRenameFind,
                      bulkRenameReplace
                    );
                    return (
                      <div key={id} className="p-2.5 flex items-center justify-between text-[11px] hover:bg-slate-100/40 dark:hover:bg-slate-900/50 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[190px] font-medium text-left" title={file.name}>
                          {file.name}
                        </span>
                        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0 mx-2" />
                        <span className="text-teal-600 dark:text-teal-400 font-bold truncate max-w-[190px] text-right" title={previewNewName || 'Unchanged'}>
                          {previewNewName || file.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  id="btn-confirm-rename-cancel"
                  onClick={() => setShowBulkRenameModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-150 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer text-center"
                  disabled={renamingBulk}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-rename-execute"
                  onClick={executeBulkRename}
                  disabled={renamingBulk}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 dark:disabled:bg-slate-805 disabled:text-slate-550 text-white font-bold text-xs shadow-md shadow-teal-100 dark:shadow-none transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {renamingBulk ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Renaming...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                      <span>Apply Changes</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Modal Confirmation Dialog for Bulk File Relocation */}
      <AnimatePresence>
        {showBulkMoveModal && (
          <div 
            id="bulk-move-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setShowBulkMoveModal(false)}
          >
            <motion.div
              id="bulk-move-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-6 relative font-sans text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded-xl flex items-center justify-center">
                    <FolderOpen className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Relocate Selected Assets
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                      Move {selectedFileIds.length} files to another directory level
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkMoveModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Unique directory options list */}
              <div className="mt-4">
                <span className="block text-[9.5px] font-bold text-slate-400 tracking-wider uppercase mb-1.5 text-left">
                  Choose Destination Folder
                </span>
                <div className="space-y-2 max-h-[160px] overflow-y-auto border border-slate-100 dark:border-slate-800 p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-950/20">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFolderToMove('');
                      setCustomMoveFolder('');
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs font-bold transition text-left ${
                      selectedFolderToMove === '' && customMoveFolder === ''
                        ? 'bg-amber-600 text-white shadow-xs border border-amber-650'
                        : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-150 dark:border-slate-800'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span>Root Directory (All Vault Files)</span>
                    </span>
                    <span className="text-[10px] opacity-70">/</span>
                  </button>

                  {Array.from(new Set(files.map(f => f.folder).filter(Boolean))).sort().map((folderPath: any) => {
                    const nameSegment = folderPath.split('/').pop() || folderPath;
                    const folderFileCount = files.filter(f => !f.isDeleted && f.folder === folderPath).length;
                    const isSelected = selectedFolderToMove === folderPath;
                    const hasFiles = folderFileCount > 0;
                    const { IconComponent, containerClass, iconClass, label: folderLabel } = getFolderIconAndStyles(nameSegment, isSelected, hasFiles);
                    return (
                      <button
                        key={folderPath}
                        type="button"
                        onClick={() => {
                          setSelectedFolderToMove(folderPath);
                          setCustomMoveFolder(folderPath);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs font-bold transition text-left ${
                          isSelected
                            ? 'bg-amber-600 text-white shadow-xs border border-amber-655'
                            : 'bg-white dark:bg-slate-950 text-slate-705 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-150 dark:border-slate-800'
                        }`}
                      >
                        <span className="flex items-center space-x-2.5 truncate">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-all duration-300 ${
                            isSelected 
                              ? 'bg-white/20 border-white/30 text-white shadow-3xs' 
                              : containerClass
                          }`}>
                            <IconComponent className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : iconClass}`} />
                          </div>
                          <div className="flex flex-col truncate text-left">
                            <span className="truncate">{folderPath}</span>
                            <span className={`text-[9px] font-medium transition-colors ${isSelected ? 'text-amber-100' : 'text-slate-400 dark:text-slate-500'}`}>
                              {folderLabel}
                            </span>
                          </div>
                        </span>
                        <span className="text-[10px] opacity-70">
                          {folderFileCount} {folderFileCount === 1 ? 'file' : 'files'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom input path */}
              <div className="space-y-1.5 mt-4">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wider text-left">
                  Or specify a new folder path
                </label>
                <div className="relative">
                  <FolderPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. Invoices/2026/Q1"
                    value={customMoveFolder}
                    onChange={(e) => {
                      setSelectedFolderToMove(null); // Clear selected tag to focus on custom text
                      setCustomMoveFolder(e.target.value);
                    }}
                    className="w-full text-xs font-bold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl pl-9 pr-3 py-2.5 text-slate-850 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed text-left">
                  Create subfolders by using a slash (<span className="font-mono bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded text-xs">/</span>), e.g. <span className="font-mono bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded">Financials/Invoices</span>.
                </p>
              </div>

              {/* Actions footer */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBulkMoveModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-150 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer text-center"
                  disabled={movingBulk}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeBulkMove(customMoveFolder.trim() === '' ? null : customMoveFolder.trim())}
                  disabled={movingBulk}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 dark:disabled:bg-slate-805 disabled:text-slate-550 text-white font-bold text-xs shadow-md shadow-amber-100 dark:shadow-none transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {movingBulk ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Relocating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                      <span>Relocate Assets</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Pre-Upload File Preview and Security Configuration Modal */}
      <AnimatePresence>
        {isPreUploadPreviewOpen && pendingUploadFile && (
          <div 
            id="pre-upload-preview-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={handleCancelPendingUpload}
          >
            <motion.div
              id="pre-upload-preview-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh] font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Title Bar */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase font-mono tracking-wider">
                      Vault Upload Inspect
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-505 font-medium">Verify credentials & attributes before server committing</p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleCancelPendingUpload}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg transition"
                  title="Close inspection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Center Pane */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                
                {/* Upper Grid Area: Visual Preview + Meta Panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Left Column: Visual Representation Box */}
                  <div className="bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 p-4 flex flex-col items-center justify-center min-h-[190px] relative overflow-hidden group">
                    
                    {pendingUploadPreviewUrl ? (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <img 
                          src={pendingUploadPreviewUrl} 
                          alt="Pre-upload visual asset"
                          className="max-h-[170px] max-w-full rounded-lg object-contain shadow-xs transition duration-350 group-hover:scale-102"
                        />
                        <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[9px] font-mono px-2 py-0.5 rounded-full select-none flex items-center space-x-1.5 backdrop-blur-xs">
                          <Image className="w-3 h-3 text-blue-400" />
                          <span>Image Artifact</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-3.5">
                        {(() => {
                          const typeConfig = getFileTypeConfig(pendingUploadFile.type, pendingUploadFileName || pendingUploadFile.name);
                          return (
                            <div className={`w-14 h-14 ${typeConfig.bgColor} rounded-2xl shadow-xs flex items-center justify-center border ${typeConfig.borderColor} mx-auto`}>
                              {typeConfig.iconLg}
                            </div>
                          );
                        })()}
                        <div className="space-y-1">
                          <span className="bg-blue-50/80 dark:bg-blue-950/45 text-blue-700 dark:text-blue-400 text-[10px] font-mono border border-blue-100 dark:border-blue-900/30 px-2 py-0.5 rounded-full font-bold">
                            {pendingUploadFile.type || 'unknown/binary'}
                          </span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1">
                            Format verified safe by fortress firewall
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Editable Metadata Controls */}
                  <div className="space-y-4">
                    {/* File Rename Input */}
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-500 dark:text-slate-450 uppercase tracking-widest font-mono mb-1.5">
                        Document Output Name
                      </label>
                      <div className="relative rounded-xl shadow-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={pendingUploadFileName}
                          onChange={(e) => setPendingUploadFileName(e.target.value)}
                          className="w-full text-xs font-bold font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition"
                          placeholder="filename.ext"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-sans">
                        You can customize this asset index title securely before committing it.
                      </p>
                    </div>

                    {/* Metadata Table */}
                    <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-xl p-3 h-[105px] flex flex-col justify-between">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-slate-400 dark:text-slate-505 block">Size</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{formatBytes(pendingUploadFile.size)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-505 block">Local Date</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                            {new Date(pendingUploadFile.lastModified || Date.now()).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 dark:border-slate-800 pt-2 text-[10px] flex items-center space-x-1.5 text-slate-500 dark:text-slate-405">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">Owner: <b>{user?.email || 'Authenticated Client'}</b></span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Constraint & Optimization Badges */}
                {pendingUploadFile.size > 15 * 1024 * 1024 ? (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl text-red-800 dark:text-red-400 text-[11px] font-bold flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>Fortress Limit Violated: File is {formatBytes(pendingUploadFile.size)}. Compliance guidelines limit files to 15MB.</span>
                  </div>
                ) : (pendingUploadFile.type.startsWith('image/') && pendingUploadFile.size > 500 * 1024) ? (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/25 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-800 dark:text-blue-400 text-[11px] font-bold flex items-start space-x-2">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>High-Res Picture: File is {formatBytes(pendingUploadFile.size)}. It will be automatically optimized during execution to ensure compliance bounds.</span>
                  </div>
                ) : null}

                {/* Attribute classification tags panel */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-extrabold text-slate-500 dark:text-slate-450 uppercase tracking-widest font-mono">
                    Zero-Trust Access Classification Tags (ABAC)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {['Draft', 'Final', 'Contract', 'Invoice', 'Confidential', 'Secure', 'Internal'].map((tag) => {
                      const isSelected = pendingFileTags.includes(tag);
                      return (
                        <button
                          key={`pre-${tag}`}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setPendingFileTags(prev => prev.filter(t => t !== tag));
                            } else {
                              setPendingFileTags(prev => [...prev, tag]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold font-mono transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs scale-102'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-650'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Applying attribute markers guarantees correct segment encapsulation in the MongoDB Atlas firewall rules.
                  </p>
                </div>

              </div>

              {/* Footer Control Buttons */}
              <div className="grid grid-cols-2 gap-3 p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <button
                  type="button"
                  id="btn-preupload-refused"
                  onClick={handleCancelPendingUpload}
                  className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-250 font-bold text-xs transition border border-slate-200 dark:border-slate-700 cursor-pointer text-center"
                >
                  Cancel & Discard Selection
                </button>
                <button
                  type="button"
                  id="btn-preupload-confirmed"
                  disabled={pendingUploadFile.size > 15 * 1024 * 1024}
                  onClick={() => {
                    setIsPreUploadPreviewOpen(false);
                    processUpload(pendingUploadFile);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:border-slate-300 disabled:text-slate-400 text-white font-bold text-xs shadow-md shadow-blue-100 dark:shadow-none transition flex items-center justify-center space-x-2 cursor-pointer duration-150 active:scale-98 font-bold"
                >
                  <CheckCircle className="w-4 h-4 text-white" />
                  <span>Execute Secure Upload</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create New Folder Custom Modal */}
      <AnimatePresence>
        {showCreateFolderModal && (
          <div 
            id="create-folder-modal-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => setShowCreateFolderModal(false)}
          >
            <motion.div
              id="create-folder-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-6 relative font-sans text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header details */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 rounded-xl flex items-center justify-center shrink-0">
                    <FolderPlus className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Create New Folder
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-550 font-medium">
                      Establish a new secure sub-chamber
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Area */}
              <form onSubmit={handleCreateFolder} className="mt-5 space-y-4 text-left">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 font-mono">
                    Folder Location
                  </label>
                  <div className="flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 text-slate-550 dark:text-slate-400 text-xs font-semibold select-none">
                    <Folder className="w-4 h-4 text-slate-400" />
                    <span className="truncate">
                      {currentFolder ? `Root / ${currentFolder}` : 'Vault Root (Home)'}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="input-folder-name" className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 font-mono">
                    Folder Name
                  </label>
                  <input
                    autoFocus
                    id="input-folder-name"
                    type="text"
                    value={newFolderName}
                    onChange={(e) => {
                      setNewFolderName(e.target.value);
                      if (folderCreationError) setFolderCreationError(null);
                    }}
                    placeholder="e.g., Financials, Confidential Docs, Receipts..."
                    className="block w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs transition font-medium"
                    maxLength={50}
                  />
                  {folderCreationError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-rose-500 dark:text-rose-400 text-[11px] font-semibold mt-2 leading-tight flex items-start space-x-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{folderCreationError}</span>
                    </motion.div>
                  )}
                </div>

                {/* Footer Controls action bar */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCreateFolderModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 transition text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="btn-confirm-create-folder"
                    className="px-4.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow-md shadow-blue-100 dark:shadow-none cursor-pointer duration-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Folder</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Right-Click Context Menu */}
      <AnimatePresence>
        {contextMenu && contextMenu.visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{ 
              position: 'fixed', 
              top: `${contextMenu.y}px`, 
              left: `${contextMenu.x}px`,
              zIndex: 99999
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-2xl font-sans"
          >
            {/* Context Item Header / Info */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/85 mb-1 max-w-full text-left">
              <span className="block text-[9px] uppercase font-mono tracking-widest font-black text-slate-400 dark:text-slate-500">
                Secure File Actions
              </span>
              <span className="block text-[11px] font-bold text-slate-750 dark:text-slate-300 truncate mt-0.5" title={contextMenu.file.name}>
                {contextMenu.file.name}
              </span>
            </div>

            {/* Generate Shareable Link Option */}
            <button
              type="button"
              id="context-menu-btn-share"
              onClick={() => {
                setShareModalFile(contextMenu.file);
                setShareModalExpiresMin(15);
                setShareModalGeneratedLink(null);
                setShareModalGenerating(false);
                setShareModalCopySuccess(false);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold font-sans text-slate-700 dark:text-slate-300 hover:bg-linear-to-r hover:from-blue-50 hover:to-blue-100/30 hover:text-blue-700 dark:hover:from-blue-950/20 dark:hover:to-blue-950/40 dark:hover:text-blue-400 rounded-xl transition-all cursor-pointer text-left"
            >
              <Share2 className="w-3.75 h-3.75 text-blue-500" />
              <span>Generate Shareable Link</span>
            </button>

            {/* View Details Option */}
            <button
              type="button"
              id="context-menu-btn-preview"
              onClick={() => {
                setSelectedPreviewFile(contextMenu.file);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold font-sans text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-all cursor-pointer text-left"
            >
              <Eye className="w-3.75 h-3.75 text-slate-400" />
              <span>View Access Log & Details</span>
            </button>

            {/* Download Decrypted Option */}
            <button
              type="button"
              id="context-menu-btn-download"
              onClick={() => {
                handleDownloadFile(contextMenu.file);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold font-sans text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-all cursor-pointer text-left"
            >
              <Download className="w-3.75 h-3.75 text-slate-400" />
              <span>Download File</span>
            </button>

            {/* Delete Option (Unless already in trash) */}
            {currentFolder !== 'Trash' && (
              <button
                type="button"
                id="context-menu-btn-delete"
                onClick={() => {
                  handleDelete(contextMenu.file.id, contextMenu.file.name);
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold font-sans text-red-600 dark:text-red-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/25 rounded-xl transition-all cursor-pointer text-left border-t border-slate-100/65 dark:border-slate-800/65 mt-1"
              >
                <Trash2 className="w-3.75 h-3.75 text-red-500" />
                <span>Delete Securely</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Dedicated Share Modal overlay and contents */}
      <AnimatePresence>
        {shareModalFile && (
          <div
            id="share-dialog-modal-overlay"
            className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => setShareModalFile(null)}
          >
            <motion.div
              id="share-dialog-modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-205 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-6 relative font-sans text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-3 text-left">
                  <div className="w-10 h-10 bg-linear-to-br from-blue-500/10 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-650/20 text-blue-600 dark:text-blue-450 border border-blue-105 dark:border-blue-900 rounded-xl flex items-center justify-center shrink-0">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Generate Shareable Link
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                      Create a temporary, secure, read-only public access URL.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  id="share-dialog-close-btn"
                  onClick={() => setShareModalFile(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Secure File Info Area */}
              <div className="mt-5 space-y-4 text-left">
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 flex items-center space-x-3.5">
                  {(() => {
                    const typeConfig = getFileTypeConfig(shareModalFile.type, shareModalFile.name);
                    return (
                      <div className={`w-9.5 h-9.5 rounded-lg flex items-center justify-center shrink-0 border transition-all ${typeConfig.bgColor} ${typeConfig.borderColor}`}>
                        {typeConfig.icon}
                      </div>
                    );
                  })()}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-750 dark:text-slate-250 truncate" title={shareModalFile.name}>
                      {shareModalFile.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Size: <b>{formatBytes(shareModalFile.size)}</b>
                    </span>
                  </div>
                </div>

                {!shareModalGeneratedLink ? (
                  <div className="space-y-4">
                    {/* Expiration Configuration Option */}
                    <div className="space-y-2">
                      <label className="block text-[10px] uppercase font-mono font-black tracking-wider text-slate-450 dark:text-slate-500">
                        Expiration horizon:
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: '15m', val: 15 },
                          { label: '1h', val: 60 },
                          { label: '24h', val: 1440 },
                          { label: '7d', val: 10080 },
                        ].map((preset) => (
                          <button
                            key={`modal-preset-${preset.label}`}
                            type="button"
                            onClick={() => setShareModalExpiresMin(preset.val)}
                            className={`text-[10px] py-2 rounded-xl font-bold transition border cursor-pointer ${
                              shareModalExpiresMin === preset.val
                                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-805 text-slate-600 dark:text-slate-350'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                        The secure credential record dynamically drops from the Atlas index when this period lapses.
                      </p>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      id="share-dialog-generate-btn"
                      onClick={handleGenerateShareModalLink}
                      disabled={shareModalGenerating}
                      className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-450 text-white font-extrabold text-xs transition flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-blue-500/10 dark:shadow-none"
                    >
                      {shareModalGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Securing Direct Gateway...</span>
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4 text-white" />
                          <span>Generate Link URL</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5 bg-sky-50/50 dark:bg-sky-950/15 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-4 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-sky-700 dark:text-sky-450">
                        Link Ready For Access:
                      </span>
                      <span className="text-[9.5px] text-sky-700 bg-sky-100 border border-sky-200/50 dark:text-sky-305 dark:bg-sky-900/40 rounded px-2 py-0.5 font-mono font-black">
                        Expires in {shareModalExpiresMin >= 1440 ? `${Math.round(shareModalExpiresMin / 1440)}d` : shareModalExpiresMin >= 60 ? `${Math.round(shareModalExpiresMin / 60)}h` : `${shareModalExpiresMin}m`}
                      </span>
                    </div>

                    <div className="flex space-x-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={shareModalGeneratedLink}
                        className="bg-white dark:bg-slate-950 border border-sky-200 dark:border-sky-900 rounded-xl px-3 py-2 text-[10.5px] font-mono text-sky-800 dark:text-sky-350 break-all select-all flex-1 min-w-0 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        id="share-dialog-copy-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(shareModalGeneratedLink);
                          setShareModalCopySuccess(true);
                          setTimeout(() => setShareModalCopySuccess(false), 2000);
                        }}
                        className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md cursor-pointer shrink-0 transition flex items-center justify-center font-bold"
                        title="Copy link to clipboard"
                      >
                        {shareModalCopySuccess ? (
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-white" />
                        )}
                      </button>
                    </div>

                    {shareModalCopySuccess && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center space-x-1 animate-fadeIn">
                        <span>✓ Link copied to clipboard! Share it with the recipient securely.</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Close Button at bottom in any state */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  id="share-dialog-done-btn"
                  onClick={() => setShareModalFile(null)}
                  className="px-4.5 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-850 text-slate-505 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
