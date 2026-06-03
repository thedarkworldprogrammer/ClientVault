/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  orderBy
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
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FolderOpen,
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
  Edit3
} from 'lucide-react';

interface DashboardProps {
  activeTab: string;
  files: ClientFile[];
  setFiles: (files: ClientFile[]) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ activeTab, files, setFiles, theme, setTheme }) => {
  const { user } = useAuth();
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

  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState<boolean>(false);
  const [shareExpiresMin, setShareExpiresMin] = useState<number>(60);
  const [generatedShareLink, setGeneratedShareLink] = useState<string | null>(null);
  const [generatingShareLink, setGeneratingShareLink] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  
  // Sorting State
  const [sortField, setSortField] = useState<'name' | 'size' | 'uploadedAt'>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              ownerId: user?.uid as string,
              tags: [],
              totalChunks,
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
          const successMsg = `"${file.name}" uploaded successfully via secure segmented transfer!`;
          setUploadSuccess(successMsg);
          fetchFiles(); // Re-fetch the list
          fetchActivities(); // Refresh activities stream
          window.dispatchEvent(new CustomEvent('secure-upload-notification', {
            detail: { type: 'success', message: successMsg }
          }));

          // Clear notification automatically after showing complete state
          setTimeout(() => {
            setUploadSuccess(null);
            setUploading(false);
            setUploadProgress(0);
          }, 1500);
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
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUpload(e.target.files[0]);
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

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Server rejected secure deletion of the selected file.');
      }
      setUploadSuccess(`"${fileName}" deleted securely from MongoDB Atlas.`);
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Purging MongoDB Atlas item failed:', err);
      setUploadError(err.message || 'Failed to delete custom item from storage system.');
    }
  };

  // Perform batch document purging
  const executeBulkDelete = async () => {
    if (selectedFileIds.length === 0) return;
    setBulkDeleteConfirm(false);
    setDeletingBulk(true);
    
    try {
      const response = await fetch('/api/files/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedFileIds })
      });
      if (!response.ok) {
        throw new Error('Server rejected bulk secure deletion.');
      }
      const data = await response.json();
      setUploadSuccess(`Permanently shredded and purged ${data.deletedCount || selectedFileIds.length} files securely.`);
      setSelectedFileIds([]); // Clear selection
      fetchFiles(); // Refresh file list
      fetchActivities(); // Refresh activities stream
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Purging multiple items failed:', err);
      setUploadError(err.message || 'Failed to complete bulk deletion.');
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
  const filteredFiles = files.filter(file => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      file.name.toLowerCase().includes(q) ||
      (file.type && file.type.toLowerCase().includes(q)) ||
      (file.tags && file.tags.some(tag => tag.toLowerCase().includes(q)));
    const matchesTag = !selectedTagFilter || (file.tags && file.tags.includes(selectedTagFilter));
    return matchesSearch && matchesTag;
  });

  // Sort files based on sort state
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === 'size') {
      comparison = a.size - b.size;
    } else if (sortField === 'uploadedAt') {
      const timeA = a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : new Date(a.uploadedAt).getTime();
      const timeB = b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : new Date(b.uploadedAt).getTime();
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              {/* Header search filter */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-slate-100">Recent Files</h2>
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

              {/* Table list */}
              {sortedFiles.length > 0 ? (
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
                          title="Click to sort by upload date"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Upload Date</span>
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
                      {sortedFiles.map((file) => (
                        <tr 
                          key={file.id} 
                          id={`file-row-${file.id}`}
                          className={`hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${selectedFileIds.includes(file.id) ? 'bg-blue-50/15 dark:bg-blue-950/20' : ''}`}
                          onClick={() => setSelectedPreviewFile(file)}
                          title="Click to preview file details"
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
                              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/40 group-hover:bg-white group-hover:border-blue-200 transition">
                                {getFileIcon(file.type)}
                              </div>
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
                          <td className="px-6 py-4 text-slate-400 text-xs flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                            <span>
                              {file.uploadedAt.toLocaleDateString()}{' '}
                              {file.uploadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-3">
                              <button
                                id={`btn-share-${file.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPreviewFile(file);
                                }}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1 cursor-pointer"
                                title="Generate temporary secure public read-only link"
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
                    <h4 className="text-[10px] font-mono font-bold text-blue-600 uppercase tracking-widest">Selected Payload</h4>
                    <h3 className="text-md font-extrabold text-slate-900 mt-1 break-words font-sans mb-1" title={selectedPreviewFile.name}>
                      {selectedPreviewFile.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 items-center mt-2">
                      <span className="bg-slate-200/60 text-slate-700 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold">
                        {formatBytes(selectedPreviewFile.size)}
                      </span>
                      <span className="bg-blue-50 text-blue-750 text-[10px] border border-blue-100 px-2 py-0.5 rounded-md font-mono truncate" title={selectedPreviewFile.type}>
                        {selectedPreviewFile.type.split('/')[1] || 'Unknown'}
                      </span>
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
                  Confirm Secure Disposal
                </h3>
                
                <p className="text-xs text-slate-550 font-medium mt-2 leading-relaxed px-1">
                  Are you absolutely sure you want to permanently shred and purge <span className="font-bold text-slate-800 break-all">"{fileToDelete.name}"</span> from your confidential file vault?
                </p>

                <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3 mt-4 text-left w-full flex items-start space-x-2.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                    This operation is final and irreversible. Our zero-trust server will immediately wipe the encrypted payload records from MongoDB Atlas.
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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 text-slate-100 px-6 py-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 z-50 w-[92%] sm:w-auto min-w-[540px] hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Archive className="w-5 h-5 animate-pulse text-blue-400" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black text-white tracking-tight">
                  {selectedFileIds.length} {selectedFileIds.length === 1 ? 'file' : 'files'} selected
                </h4>
                <p className="text-[10px] text-slate-400 font-medium">
                  Pack into secure ZIP or clean securely from MongoDB vault
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
                  Disposal of {selectedFileIds.length} Selected Files
                </h3>
                
                <p className="text-xs text-slate-550 font-medium mt-2 leading-relaxed px-1">
                  Are you absolutely sure you want to permanently shred and purge <span className="font-extrabold text-red-600">{selectedFileIds.length} select files</span> from your secure file vault?
                </p>

                <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3 mt-4 text-left w-full flex items-start space-x-2.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                    This collective payload disposal is final. Our server will immediately wipe these records and their content entries from MongoDB Atlas permanently.
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
                  Keep Payloads
                </button>
                <button
                  id="btn-confirm-bulk-delete-execute"
                  onClick={executeBulkDelete}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-100 transition border border-red-700 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge All</span>
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

    </div>
  );
};
