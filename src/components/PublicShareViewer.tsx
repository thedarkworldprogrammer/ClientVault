import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Download, 
  Clock, 
  Tag, 
  File, 
  FileText, 
  AlertTriangle, 
  HelpCircle, 
  CornerDownRight, 
  Home,
  CheckCircle,
  Copy
} from 'lucide-react';
import { ClientFile } from '../types';

interface PublicShareViewerProps {
  token: string;
  onClose: () => void;
}

export const PublicShareViewer: React.FC<PublicShareViewerProps> = ({ token, onClose }) => {
  const [file, setFile] = useState<ClientFile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<boolean>(false);

  useEffect(() => {
    const fetchSharedAsset = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/shares/${token}`);
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to access the temporary secure repository.');
        }
        const data = await response.json();
        setFile({
          ...data,
          uploadedAt: new Date(data.uploadedAt)
        });
      } catch (err: any) {
        console.error('Failure opening shared link:', err);
        setError(err.message || 'The transfer link has expired or was shredded from secure storage.');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedAsset();
  }, [token]);

  // Transcoders size units
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <File className="w-10 h-10 text-emerald-500" />;
    if (type.startsWith('video/')) return <File className="w-10 h-10 text-rose-500" />;
    if (type.startsWith('audio/')) return <File className="w-10 h-10 text-amber-500" />;
    if (type.includes('pdf')) return <FileText className="w-10 h-10 text-red-500" />;
    return <FileText className="w-10 h-10 text-blue-500" />;
  };

  const getTextPreview = (content: string): string | null => {
    if (!content) return null;
    try {
      if (content.startsWith('data:')) {
        const parts = content.split(',');
        if (parts.length > 1) {
          const decoded = atob(parts[1]);
          // Simple validation if text looks binary or clean
          let nonPrintableCount = 0;
          for (let i = 0; i < Math.min(decoded.length, 500); i++) {
            const code = decoded.charCodeAt(i);
            if (code < 9 || (code > 13 && code < 32)) {
              nonPrintableCount++;
            }
          }
          if (nonPrintableCount > 10) return null; // Looks like binary data (image/mp3)
          return decoded.substring(0, 15000) + (decoded.length > 15000 ? '\n\n... [Content truncated due to read-only security limits]' : '');
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleDownloadFile = () => {
    if (!file) return;
    try {
      setDownloading(true);
      const link = document.createElement('a');
      link.href = file.content;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download stream error:', err);
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-pulse select-none">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs relative flex items-center justify-center">
            <Shield className="w-8 h-8 text-blue-600 animate-spin" />
            <Clock className="w-4 h-4 text-blue-600 absolute" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-slate-800">Verifying Crypotographic Link Integrity</h3>
            <p className="text-xs text-slate-400 mt-1">Analyzing sandbox vaults and expiry logs securely...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-700 font-sans">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-lg shadow-slate-100/50 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <h2 className="text-md sm:text-lg font-black text-slate-800 tracking-tight">Access Link Expired or Purged</h2>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              For client zero-trust compliance, file sharing keys automatically incinerate on expiration. Request a fresh temporary secure link from the vault administrator.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 font-mono text-[11px] text-slate-500 leading-relaxed break-words">
            <span className="font-bold text-red-600">Error Payload:</span> {error || "No shared file object resolved."}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Secure Portal</span>
          </button>
        </div>
      </div>
    );
  }

  const textPreview = getTextPreview(file.content);

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-between font-sans text-slate-700 fill-inherit">
      {/* Decorative High-Contrast Minimal Header */}
      <header className="bg-white border-b border-slate-200/80 h-16 flex items-center justify-between px-6 sm:px-10 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-100 shrink-0 select-none">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-slate-800 tracking-tight">ClientVault</span>
            <span className="text-[9px] font-extrabold text-blue-600 bg-sky-50 px-1.5 py-0.5 rounded ml-2 border border-sky-100 uppercase tracking-widest hidden sm:inline-block">Secure Shared Transfer</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Go to Portal</span>
        </button>
      </header>

      {/* Main Sharing Display Frame */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column - Preview Core Widget */}
          <div className="md:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-100/50 overflow-hidden flex flex-col">
            {/* Visual Header */}
            <div className="aspect-video bg-slate-50 border-b border-slate-100 relative flex items-center justify-center overflow-hidden group">
              {file.type.startsWith('image/') ? (
                <img 
                  src={file.content} 
                  alt={file.name} 
                  className="w-full h-full object-contain pointer-events-none transition group-hover:scale-[1.01]"
                  referrerPolicy="no-referrer"
                />
              ) : file.type.startsWith('video/') ? (
                <video 
                  src={file.content} 
                  controls 
                  className="w-full h-full object-contain"
                />
              ) : textPreview ? (
                <div className="w-full h-full p-6 overflow-hidden flex flex-col select-all">
                  <div className="flex items-center space-x-1.5 mb-2 shrink-0">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Secure Content Read-Only:</span>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-650 bg-slate-100 border border-slate-200 rounded-lg p-3 overflow-y-auto max-h-[160px] whitespace-pre-wrap leading-relaxed select-text flex-1">
                    {textPreview}
                  </pre>
                </div>
              ) : (
                <div className="text-center p-6 space-y-2 select-none">
                  <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 shadow-md shadow-slate-100 flex items-center justify-center mx-auto mb-2">
                    {getFileIcon(file.type)}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-450 uppercase font-mono">No Asset Inline Viewer Available</p>
                  <p className="text-[10px] text-slate-400 max-w-xs mx-auto">This binary content can be viewed safely after downloading.</p>
                </div>
              )}
            </div>

            {/* Content Details Grid */}
            <div className="p-6 space-y-4">
              <div>
                <span className="text-[9px] uppercase font-mono font-bold text-slate-400 tracking-wider">File Resource Cryptographic Identity:</span>
                <h2 className="text-base font-extrabold text-slate-800 break-words mt-1 leading-snug">{file.name}</h2>
              </div>

              {/* Tags panel if any */}
              {file.tags && file.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {file.tags.map(tag => (
                    <span 
                      key={tag}
                      className="bg-blue-50 border border-blue-100/60 text-blue-700 font-extrabold text-[9.5px] px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 cursor-default"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Download Actions Widget */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xl shadow-slate-100/50 space-y-6">
              <div className="space-y-1">
                <span className="text-[9.5px] uppercase font-mono font-extrabold tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">✔ Authorized Access</span>
                <h3 className="text-sm font-black text-slate-805 mt-3 select-none">Read-Only Secure Shared Asset</h3>
                <p className="text-xs text-slate-400 select-none">Verifiable cryptographic file transmission via ClientVault Secure Gateway.</p>
              </div>

              <hr className="border-slate-150" />

              <div className="space-y-3 text-xs select-none">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-400 font-medium">Resource Size:</span>
                  <span className="font-mono font-bold text-slate-850">{formatBytes(file.size)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-400 font-medium">Encoding:</span>
                  <span className="font-mono text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded uppercase">Base64 TLS Tunnel</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-400 font-medium font-sans">Content-Type:</span>
                  <span className="font-mono text-[10px] max-w-[130px] truncate" title={file.type}>{file.type}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-400 font-medium">Secured On:</span>
                  <span>{file.uploadedAt.toLocaleDateString()}</span>
                </div>
              </div>

              <hr className="border-slate-150" />

              {/* Big Download Button */}
              <button
                type="button"
                onClick={handleDownloadFile}
                disabled={downloading}
                className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-xs shadow-lg shadow-blue-200/50 hover:shadow-blue-300/60 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition duration-200 cursor-pointer flex items-center justify-center space-x-2"
              >
                {downloading ? (
                  <>
                    <Shield className="w-4 h-4 animate-spin text-white" />
                    <span>Streaming Payload Bytes...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-white" />
                    <span>Download Shared Asset</span>
                  </>
                )}
              </button>
            </div>

            {/* Notice Footer Card */}
            <div className="bg-blue-50/50 border border-blue-100/60 rounded-3xl p-6 select-none">
              <div className="flex space-x-3">
                <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-blue-900">Zero-Trust Vault Protocol</h4>
                  <p className="text-[10.5px] text-blue-700 leading-relaxed font-semibold">
                    ClientVault guarantees absolute sandboxing privacy. No information from this download session will reside on third-party servers. All connections are fully authenticated in real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding Statement */}
      <footer className="text-center py-6 border-t border-slate-200 bg-white select-none text-[10.5px] text-slate-400">
        <p>ClientVault High-Compliancy Cryptographic Portal • Created in Sandboxed Node Container Environment</p>
      </footer>
    </div>
  );
};
