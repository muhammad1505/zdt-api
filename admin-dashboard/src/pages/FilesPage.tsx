import { useState, useEffect, useRef } from 'react';
import {
  Search, File as FileIcon, Disc3, Download, Play, Upload, RefreshCw, X, Pencil, Trash2,
  FileText, Video, Music, Archive, ImageIcon, FileCode
} from 'lucide-react';
import api, { getStreamUrl, getDownloadUrl, uploadFile, renameFile, deleteFile } from '../api/client';
import FileBrowser from '../components/FileBrowser';
import Swal from 'sweetalert2';

function fmtSize(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

const VIDEO_TYPES = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi']);
const AUDIO_TYPES = new Set(['mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'aac']);
const DOC_TYPES = new Set(['pdf', 'txt', 'md', 'json', 'xml', 'csv', 'log', 'ini', 'cfg', 'yaml', 'yml', 'toml', 'html', 'htm', 'css', 'js', 'ts', 'py', 'sh', 'bat']);
const ARCHIVE_TYPES = new Set(['zip', 'rar', 'tar', 'gz', 'bz2', '7z', 'xz']);
const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);

function fileIcon(type: string) {
  if (VIDEO_TYPES.has(type)) return <Video className="text-brand-500 size-4" />;
  if (AUDIO_TYPES.has(type)) return <Music className="text-warning-500 size-4" />;
  if (IMAGE_TYPES.has(type)) return <ImageIcon className="text-success-500 size-4" />;
  if (DOC_TYPES.has(type)) return <FileText className="text-brand-500 size-4" />;
  if (ARCHIVE_TYPES.has(type)) return <Archive className="text-gray-500 size-4" />;
  if (['py', 'js', 'ts', 'sh', 'html', 'css'].includes(type)) return <FileCode className="text-brand-500 size-4" />;
  return <FileIcon className="text-gray-500 size-4" />;
}

const toast = (icon: 'success' | 'error' | 'info', title: string) => {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#ffffff', color: '#1d2939', customClass: { container: '!z-[999999]' } });
};

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [targetDir, setTargetDir] = useState('');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editFile, setEditFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/files');
      setFiles(res.data.files || []);
      setTargetDir(res.data.path || '');
    } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const filtered = search ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : files;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadProgress(0); setUploadError(null);
    try {
      await uploadFile(file, (pct) => setUploadProgress(pct));
      setUploadProgress(100); fetch();
      toast('success', `${file.name} uploaded`);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || err.message || 'Upload gagal');
      toast('error', err.response?.data?.error || 'Upload gagal');
    }
    setTimeout(() => { setUploading(false); setUploadProgress(0); }, 1200);
    if (ref.current) ref.current.value = '';
  };

  const handleDirSelected = (_files: string[], folder: string) => {
    setShowDirPicker(false);
    if (folder) { api.post('/api/settings/storage', { target_dir: folder }); setTargetDir(folder); }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameFile(renameTarget.path, renameValue.trim());
      toast('success', 'File renamed');
      setRenameTarget(null); fetch();
    } catch (err: any) { toast('error', err.response?.data?.error || 'Gagal rename'); }
  };

  const handleDelete = async (f: any) => {
    const res = await Swal.fire({ title: 'Delete this file?', text: f.name, icon: 'warning', showCancelButton: true, confirmButtonColor: '#f04438', cancelButtonColor: '#667085', confirmButtonText: 'Delete', background: '#ffffff', color: '#1d2939' });
    if (!res.isConfirmed) return;
    try {
      await deleteFile(f.path || f.name);
      toast('success', 'File deleted');
      fetch();
    } catch (err: any) { toast('error', err.response?.data?.error || 'Gagal hapus'); }
  };

  const handleEditText = async (f: any) => {
    try {
      const res = await api.get(getDownloadUrl(f.path), { responseType: 'text' });
      const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
      setEditFile({ path: f.path, name: f.name, content: text });
      setEditContent(text);
    } catch { toast('error', 'Failed to load file'); }
  };

  const handleSaveText = async () => {
    if (!editFile) return;
    try {
      const blob = new Blob([editContent], { type: 'text/plain' });
      const file = new window.File([blob], editFile.name);
      await uploadFile(file, () => {});
      toast('success', 'File saved');
      setEditFile(null); fetch();
    } catch { toast('error', 'Failed to save'); }
  };

  const handleOpen = (f: any) => {
    const url = getStreamUrl(f.path);
    const ext = f.type;
    if (VIDEO_TYPES.has(ext) || AUDIO_TYPES.has(ext)) {
      setPreview({ url, type: ext, name: f.name });
    } else if (IMAGE_TYPES.has(ext)) {
      setPreview({ url, type: ext, name: f.name });
    } else if (ext === 'pdf') {
      window.open(url, '_blank');
    } else if (DOC_TYPES.has(ext)) {
      handleEditText(f);
    } else if (ARCHIVE_TYPES.has(ext)) {
      Swal.fire({ title: 'Archive File', text: `${f.name} — this archive format cannot be previewed directly. Download it to extract locally.`, icon: 'info', confirmButtonText: 'OK', background: '#ffffff', color: '#1d2939' });
    } else {
      Swal.fire({ title: 'Unsupported', text: `Cannot preview ${f.type.toUpperCase()} files.`, icon: 'info', confirmButtonText: 'OK', background: '#ffffff', color: '#1d2939' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Files</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage uploaded files</p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex gap-3 mb-4 items-center flex-wrap">
          <Search size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
          <input placeholder="Search files..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-[400px] px-3.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{files.length} files</span>
          <button onClick={() => ref.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">
            <Upload size={16} /> Upload
          </button>
          <input ref={ref} type="file" hidden onChange={handleUpload} />
          <button onClick={fetch} disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer disabled:opacity-50">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 mb-4">
          <Disc3 size={16} className="text-warning-500 shrink-0" />
          <span className="flex-1 text-sm text-gray-800 dark:text-white/90 font-mono">{targetDir || 'Not set'}</span>
          <button onClick={() => setShowDirPicker(true)}
            className="px-3 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer">Change</button>
        </div>

        {showDirPicker && (
          <FileBrowser title="Pilih Target Directory" onSelect={handleDirSelected} onCancel={() => setShowDirPicker(false)} folderPicker />
        )}

        {uploading && (
          <div className="px-4 py-3 mb-3 rounded-lg border border-warning-200 dark:border-warning-500/20 bg-warning-50 dark:bg-warning-500/5">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-warning-600 dark:text-warning-500">Uploading... {uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-warning-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        {uploadError && (
          <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-lg border border-error-200 dark:border-error-500/20 bg-error-50 dark:bg-error-500/5 text-error-600 dark:text-error-500 text-xs cursor-pointer" onClick={() => setUploadError(null)}>
            {uploadError} <X size={14} />
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 w-[400px] max-w-[90%] shadow-theme-md">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-4">Rename File</h3>
            <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border mb-4"
              onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleRename}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Text Editor Modal */}
      {editFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 w-[700px] max-w-[95vw] max-h-[90vh] shadow-theme-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">{editFile.name}</h3>
              <div className="flex gap-2">
                <button onClick={handleSaveText}
                  className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">Save</button>
                <button onClick={() => setEditFile(null)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
              </div>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              className="flex-1 p-4 bg-gray-50 dark:bg-gray-800 text-sm font-mono text-gray-800 dark:text-white/90 outline-none border-none resize-none min-h-[300px]"
              spellCheck={false} />
          </div>
        </div>
      )}

      {/* File List */}
      {loading ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">{search ? 'No matches' : 'No files'}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <div key={f.path} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4 flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${
                  ARCHIVE_TYPES.has(f.type) ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  {fileIcon(f.type)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 dark:text-white/90 truncate font-medium">{f.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.type.toUpperCase()} · {fmtSize(f.size)} · {new Date(f.modified * 1000).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => handleOpen(f)}
                  className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border-none cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors" title="Open / Play">
                  {VIDEO_TYPES.has(f.type) || AUDIO_TYPES.has(f.type) ? <Play size={14} /> : <FileText size={14} />}
                </button>
                <button onClick={() => { setRenameTarget({ path: f.path || f.name, name: f.name }); setRenameValue(f.name); }}
                  className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border-none cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors" title="Rename">
                  <Pencil size={14} />
                </button>
                <a href={getDownloadUrl(f.path)} download
                  className="p-2 rounded-md bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500 border-none cursor-pointer no-underline inline-flex hover:bg-success-100 dark:hover:bg-success-500/20 transition-colors" title="Download">
                  <Download size={14} />
                </a>
                <button onClick={() => handleDelete(f)}
                  className="p-2 rounded-md bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500 border-none cursor-pointer hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media / Image Preview */}
      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99999]" onClick={() => setPreview(null)}>
          <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <div className="text-white/80 text-xs mb-3">{preview.name}</div>
            {VIDEO_TYPES.has(preview.type) ? (
              <video src={preview.url} controls autoPlay className="max-w-full max-h-[75vh] rounded-2xl" />
            ) : AUDIO_TYPES.has(preview.type) ? (
              <audio src={preview.url} controls autoPlay className="w-[450px]" />
            ) : (
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-[75vh] rounded-2xl object-contain" />
            )}
            <button onClick={() => setPreview(null)} className="mt-4 px-5 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700 transition-colors border-none cursor-pointer">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
