import { useState, useEffect } from 'react';
import { apiSilent } from '../api/client';
import { Folder, File, ChevronRight, CheckSquare, Square, FolderPlus, Pencil, Trash2 } from 'lucide-react';

interface FileEntry {
  name: string; path: string; size: number; type: string; modified: number;
}
interface FolderEntry {
  name: string; path: string;
}

interface Props {
  onSelect: (files: string[], folder: string) => void;
  onCancel: () => void;
  title: string;
  multiFile?: boolean;
  showFiles?: boolean;
  folderPicker?: boolean;
  scope?: 'media' | 'system';
}

export default function FileBrowser({ onSelect, onCancel, title, multiFile, showFiles, folderPicker, scope }: Props) {
  const [currentDir, setCurrentDir] = useState('');
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);

  const showFilesFlag = showFiles !== false;

  const fetchDir = async (dir: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { dir };
      if (scope === 'system') params.scope = 'system';
      const res = await apiSilent.get('/api/files/browse', { params });
      setFolders(res.data.folders || []);
      setFiles(res.data.files || []);
      setCurrentDir(res.data.path || '');
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchDir(''); }, []);

  const enterFolder = (path: string) => {
    setHistory(prev => [...prev, currentDir]);
    setSelectedFiles(new Set());
    fetchDir(path);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setSelectedFiles(new Set());
    fetchDir(prev);
  };

  const toggleFile = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.path)));
    }
  };

  const payload = (p: string) => scope === 'system' ? { path: p, scope } : { path: p };

  const newFolder = async () => {
    const name = window.prompt('Nama folder baru:');
    if (!name) return;
    try {
      const body: Record<string, string> = { name, scope: scope || 'media' };
      if (scope === 'system' && currentDir) body.dir = currentDir;
      await apiSilent.post('/api/files/mkdir', body);
      fetchDir(currentDir);
    } catch {}
  };

  const renameFolder = async (folder: FolderEntry) => {
    const newName = window.prompt('Nama baru:', folder.name);
    if (!newName || newName === folder.name) return;
    try {
      await apiSilent.post('/api/files/rename', { ...payload(folder.path), new_name: newName });
      fetchDir(currentDir);
    } catch {}
  };

  const deleteFolder = async (folder: FolderEntry) => {
    if (!window.confirm(`Hapus folder "${folder.name}" beserta isinya?`)) return;
    try {
      await apiSilent.post('/api/files/delete', payload(folder.path));
      fetchDir(currentDir);
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] animate-fadeIn">
      <div className="card bg-base-100 border border-base-200 w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col animate-scaleIn">
        <div className="px-5 py-4 border-b border-base-200">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-base font-semibold text-base-content m-0">{title}</h3>
            <button onClick={newFolder} title="Buat folder baru" className="btn btn-ghost btn-xs gap-1 text-primary font-bold">
              <FolderPlus size={14} /> Baru
            </button>
          </div>
          <div className="text-xs text-base-content/60 flex items-center gap-1">
            <span onClick={goBack} className={history.length ? 'text-primary cursor-pointer' : 'text-base-content/60'}>root</span>
            {currentDir && <><ChevronRight size={12} /><span>{currentDir}</span></>}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="text-center py-10 text-sm text-base-content/60">Loading...</div>
          ) : (
            <>
              {history.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-base-200 text-sm text-base-content hover:bg-base-200/50 transition-colors" onClick={goBack}>
                  <ChevronRight size={14} className="text-base-content/60 -rotate-180" />
                  <span className="text-base-content/60">..</span>
                </div>
              )}
              {folders.map(f => (
                <div key={f.path} className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-base-200 text-sm text-base-content hover:bg-base-200/50 transition-colors" onClick={() => enterFolder(f.path)}
                  onMouseEnter={() => setHoverFolder(f.path)} onMouseLeave={() => setHoverFolder(null)}>
                  <Folder size={16} className="text-warning shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  {hoverFolder === f.path && (
                    <span className="flex gap-0.5">
                      <button onClick={e => { e.stopPropagation(); renameFolder(f); }} className="btn btn-ghost btn-xs" title="Ganti nama">
                        <Pencil size={13} className="text-base-content/60" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteFolder(f); }} className="btn btn-ghost btn-xs" title="Hapus">
                        <Trash2 size={13} className="text-error" />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {showFilesFlag && files.map(f => (
                <div key={f.path} className={selectedFiles.has(f.path) ? "flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-base-200 text-sm text-base-content bg-base-200" : "flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-base-200 text-sm text-base-content hover:bg-base-200/50 transition-colors"} onClick={() => multiFile ? toggleFile(f.path) : onSelect([f.path], currentDir)}>
                  {multiFile && (
                    <span onClick={e => { e.stopPropagation(); toggleFile(f.path); }}>
                      {selectedFiles.has(f.path) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} className="text-base-content/60" />}
                    </span>
                  )}
                  <File size={16} className="text-base-content/60 shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-[11px] text-base-content/60 ml-2 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              ))}
              {files.length === 0 && folders.length === 0 && (
                <div className="text-center py-10 text-sm text-base-content/60">Folder kosong</div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-base-200 flex gap-2 justify-between items-center">
          <div className="flex gap-2">
            {multiFile && files.length > 0 && (
              <button onClick={selectAll} className="btn btn-ghost btn-sm font-bold">
                {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {!folderPicker && (
              <button onClick={() => onSelect([], currentDir)} className="btn btn-success btn-sm font-bold">
                Proses Semua{currentDir ? ` (${currentDir})` : ''}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn btn-ghost btn-sm font-bold">Batal</button>
            {folderPicker && !(folderPicker && !currentDir) && (
              <button onClick={() => onSelect([], currentDir)} className="btn btn-primary btn-sm font-bold">
                Pilih Folder Ini{currentDir ? ` (${currentDir})` : ''}
              </button>
            )}
            {multiFile && selectedFiles.size > 0 && (
              <button onClick={() => onSelect(Array.from(selectedFiles), currentDir)} className="btn btn-primary btn-sm font-bold">
                Proses {selectedFiles.size} File
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
