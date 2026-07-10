import { useState, useEffect, useRef } from 'react';
import {
  Search, File as FileIcon, Disc3, Download, Play, Upload, RefreshCw, X, Pencil, Trash2,
  FileText, Video, Music, Archive, ImageIcon, FileCode, Folder, ChevronRight, ArrowUp
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
  if (VIDEO_TYPES.has(type)) return <Video className="text-primary size-4" />;
  if (AUDIO_TYPES.has(type)) return <Music className="text-primary size-4" />;
  if (IMAGE_TYPES.has(type)) return <ImageIcon className="text-primary size-4" />;
  if (DOC_TYPES.has(type)) return <FileText className="text-primary size-4" />;
  if (ARCHIVE_TYPES.has(type)) return <Archive className="text-base-content/60 size-4" />;
  if (['py', 'js', 'ts', 'sh', 'html', 'css'].includes(type)) return <FileCode className="text-primary size-4" />;
  return <FileIcon className="text-base-content/60 size-4" />;
}

const toast = (icon: 'success' | 'error' | 'info', title: string) => {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
};

export default function FilesPage() {
  const [currentDir, setCurrentDir] = useState('');
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
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

  const browseDir = async (dir: string) => {
    setLoading(true);
    try {
      const res = await api.get('/api/files/browse', { params: { dir, scope: 'media' } });
      setFolders(res.data.folders || []);
      setFiles(res.data.files || []);
      setCurrentDir(res.data.path || '');
    } catch {}
    setLoading(false);
  };

  useEffect(() => { browseDir(''); }, []);

  const fetchMeta = async () => {
    try {
      const res = await api.get('/api/settings');
      setTargetDir(res.data.storage?.target_dir || '');
    } catch {}
  };
  useEffect(() => { fetchMeta(); }, []);

  const enterFolder = (path: string) => {
    setHistory(prev => [...prev, currentDir]);
    setSearch('');
    setFilterType('all');
    browseDir(path);
  };

  const goUp = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setSearch('');
    setFilterType('all');
    browseDir(prev);
  };

  const goToBreadcrumb = (idx: number) => {
    const parts = currentDir ? currentDir.split('/') : [];
    const targetParts = parts.slice(0, idx + 1);
    const target = targetParts.join('/');
    const newHistory: string[] = [];
    let acc = '';
    for (const p of parts) {
      if (acc === target) break;
      newHistory.push(acc);
      acc = acc ? acc + '/' + p : p;
    }
    setHistory(newHistory);
    setSearch('');
    setFilterType('all');
    browseDir(target);
  };

  const filteredFiles = files.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && f.type !== filterType) return false;
    return true;
  });

  const filteredFolders = folders.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadProgress(0); setUploadError(null);
    try {
      await uploadFile(file, (pct) => setUploadProgress(pct));
      setUploadProgress(100); browseDir(currentDir);
      toast('success', `${file.name} uploaded`);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || err.message || 'Upload gagal');
      toast('error', err.response?.data?.error || 'Upload gagal');
    }
    setTimeout(() => { setUploading(false); setUploadProgress(0); }, 1200);
    if (ref.current) ref.current.value = '';
  };

  const handleDirSelected = async (_files: string[], folder: string) => {
    setShowDirPicker(false);
    if (folder) {
      const absFolder = folder.startsWith('/') ? folder : '/' + folder;
      try {
        const res = await api.post('/api/settings/storage', { target_dir: absFolder });
        setTargetDir(res.data.target_dir || absFolder);
        setHistory([]);
        browseDir('');
        toast('success', 'Target directory diubah');
      } catch { toast('error', 'Gagal ganti directory'); }
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameFile(renameTarget.path, renameValue.trim());
      toast('success', 'File renamed');
      setRenameTarget(null); browseDir(currentDir);
    } catch (err: any) { toast('error', err.response?.data?.error || 'Gagal rename'); }
  };

  const handleDelete = async (item: any) => {
    const res = await Swal.fire({ title: 'Hapus?', text: item.name, icon: 'warning', showCancelButton: true, confirmButtonColor: 'var(--er)', cancelButtonColor: 'var(--b3)', confirmButtonText: 'Hapus', background: 'var(--b1)', color: 'var(--bc)' });
    if (!res.isConfirmed) return;
    try {
      await deleteFile(item.path || item.name);
      toast('success', 'Berhasil dihapus');
      browseDir(currentDir);
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
      setEditFile(null); browseDir(currentDir);
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
      Swal.fire({ title: 'Archive File', text: `${f.name} — this archive format cannot be previewed directly. Download it to extract locally.`, icon: 'info', confirmButtonText: 'OK', background: 'var(--b1)', color: 'var(--bc)' });
    } else {
      Swal.fire({ title: 'Unsupported', text: `Cannot preview ${f.type.toUpperCase()} files.`, icon: 'info', confirmButtonText: 'OK', background: 'var(--b1)', color: 'var(--bc)' });
    }
  };

  const breadcrumbParts = currentDir ? currentDir.split('/') : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-base-content">Files</h2>
        <p className="text-sm text-base-content/60 mt-1">Browse and manage files</p>
      </div>

      <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
        <div className="flex gap-3 mb-4 items-center flex-wrap">
          <Search size={16} className="text-base-content/60 shrink-0" />
          <input placeholder="Cari file atau folder..." value={search} onChange={e => setSearch(e.target.value)}
            className="input input-bordered flex-1 max-w-[400px]" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="select select-bordered max-w-[130px]">
            <option value="all">Semua</option>
            <option value="mp3">Audio</option>
            <option value="mp4">Video</option>
            <option value="jpg">Gambar</option>
            <option value="pdf">Dokumen</option>
            <option value="zip">Arsip</option>
          </select>
          <button onClick={() => ref.current?.click()}
            className="btn btn-primary">
            <Upload size={16} /> Upload
          </button>
          <input ref={ref} type="file" hidden onChange={handleUpload} />
          <button onClick={() => browseDir(currentDir)} disabled={loading}
            className="btn btn-ghost">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-base-200 mb-4">
          <Disc3 size={16} className="text-warning shrink-0" />
          <span className="flex-1 text-sm text-base-content font-mono truncate">{targetDir || 'Not set'}</span>
          <button onClick={() => setShowDirPicker(true)}
            className="btn btn-ghost btn-xs">Change</button>
        </div>

        {showDirPicker && (
          <FileBrowser title="Pilih Target Directory" onSelect={handleDirSelected} onCancel={() => setShowDirPicker(false)} folderPicker scope="system" />
        )}

        {uploading && (
          <div className="px-4 py-3 mb-3 rounded-lg border border-warning/20 bg-warning/5">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-warning">Uploading... {uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-base-300 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-warning transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        {uploadError && (
          <div className="alert alert-error text-xs cursor-pointer" onClick={() => setUploadError(null)}>
            {uploadError} <X size={14} />
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      {currentDir !== '' && (
        <div className="flex items-center gap-1 text-sm text-base-content/60">
          <button onClick={goUp} className="btn btn-ghost btn-xs gap-1">
            <ArrowUp size={14} /> Naik
          </button>
          <span className="mx-1 text-base-content/30">|</span>
          <button onClick={() => { setHistory([]); setSearch(''); setFilterType('all'); browseDir(''); }}
            className="btn btn-ghost btn-xs">root</button>
          {breadcrumbParts.map((part, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-base-content/30" />
              <button onClick={() => goToBreadcrumb(idx)}
                className={`btn btn-ghost btn-xs ${idx === breadcrumbParts.length - 1 ? 'text-base-content font-semibold' : ''}`}>
                {part}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* File List */}
      {loading ? (
        <div className="text-center py-10 text-sm text-base-content/60">Loading...</div>
      ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
        <div className="text-center py-10 text-sm text-base-content/60">{search ? 'Tidak ditemukan' : 'Kosong'}</div>
      ) : (
        <div className="card bg-base-100 border border-base-200 overflow-hidden">
          <table className="table w-full">
            <thead>
              <tr className="bg-base-200/50">
                <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Name</th>
                <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider w-24">Size</th>
                <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider w-20">Type</th>
                <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider w-28">Date</th>
                <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentDir !== '' && history.length > 0 && (
                <tr className="hover:bg-base-200/30 transition-colors cursor-pointer" onClick={goUp}>
                  <td colSpan={5} className="py-3">
                    <div className="flex items-center gap-3 text-base-content/60">
                      <ArrowUp size={16} />
                      <span>..</span>
                    </div>
                  </td>
                </tr>
              )}
              {filteredFolders.map(f => (
                <tr key={f.path} className="hover:bg-base-200/30 transition-colors cursor-pointer" onClick={() => enterFolder(f.path)}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <Folder size={18} className="text-warning shrink-0" />
                      <span className="text-sm text-base-content font-medium">{f.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-base-content/60">—</td>
                  <td className="py-3"><span className="badge badge-sm">folder</span></td>
                  <td className="py-3 text-xs text-base-content/60">—</td>
                  <td className="py-3">
                    <button onClick={e => { e.stopPropagation(); handleDelete(f); }}
                      className="btn btn-ghost btn-xs text-error" title="Hapus folder">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredFiles.map(f => (
                <tr key={f.path} className="hover:bg-base-200/30 transition-colors cursor-pointer" onDoubleClick={() => handleOpen(f)}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-base-200 shrink-0">
                        {fileIcon(f.type)}
                      </div>
                      <span className="text-sm text-base-content font-medium truncate max-w-[400px]">{f.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-base-content/60">{fmtSize(f.size)}</td>
                  <td className="py-3"><span className="badge badge-sm">{f.type.toUpperCase()}</span></td>
                  <td className="py-3 text-xs text-base-content/60">{new Date(f.modified * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleOpen(f)}
                        className="btn btn-ghost btn-xs text-primary" title="Open / Play">
                        {VIDEO_TYPES.has(f.type) || AUDIO_TYPES.has(f.type) ? <Play size={14} /> : <FileText size={14} />}
                      </button>
                      <button onClick={() => { setRenameTarget({ path: f.path || f.name, name: f.name }); setRenameValue(f.name); }}
                        className="btn btn-ghost btn-xs text-primary" title="Rename">
                        <Pencil size={14} />
                      </button>
                      <a href={getDownloadUrl(f.path)} download
                        className="btn btn-ghost btn-xs text-success" title="Download">
                        <Download size={14} />
                      </a>
                      <button onClick={() => handleDelete(f)}
                        className="btn btn-ghost btn-xs text-error" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 p-6 w-[400px] max-w-[90%] shadow-md">
            <h3 className="text-base font-semibold text-base-content mb-4">Rename File</h3>
            <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="input input-bordered w-full mb-4"
              onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenameTarget(null)}
                className="btn btn-ghost">Cancel</button>
              <button onClick={handleRename}
                className="btn btn-primary">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Text Editor Modal */}
      {editFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 w-[700px] max-w-[95vw] max-h-[90vh] shadow-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-200">
              <h3 className="text-sm font-semibold text-base-content truncate">{editFile.name}</h3>
              <div className="flex gap-2">
                <button onClick={handleSaveText}
                  className="btn btn-primary">Save</button>
                <button onClick={() => setEditFile(null)}
                  className="btn btn-ghost">Cancel</button>
              </div>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              className="flex-1 p-4 bg-base-200 text-sm font-mono text-base-content outline-none border-none resize-none min-h-[300px]"
              spellCheck={false} />
          </div>
        </div>
      )}

      {/* Media / Image Preview */}
      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] animate-fadeIn" onClick={() => setPreview(null)}>
          <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-scaleIn">
            <div className="text-base-content/80 text-xs mb-3">{preview.name}</div>
            {VIDEO_TYPES.has(preview.type) ? (
              <video src={preview.url} controls autoPlay className="max-w-full max-h-[75vh] rounded-2xl" />
            ) : AUDIO_TYPES.has(preview.type) ? (
              <audio src={preview.url} controls autoPlay className="w-[450px]" />
            ) : (
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-[75vh] rounded-2xl object-contain" />
            )}
            <button onClick={() => setPreview(null)} className="btn btn-ghost btn-sm mt-4">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
