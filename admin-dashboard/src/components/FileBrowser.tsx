import { useState, useEffect } from 'react';
import api from '../api/client';
import { Folder, File, ChevronRight, CheckSquare, Square } from 'lucide-react';

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
}

export default function FileBrowser({ onSelect, onCancel, title, multiFile, showFiles, folderPicker }: Props) {
  const [currentDir, setCurrentDir] = useState('');
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const showFilesFlag = showFiles !== false;

  const fetchDir = async (dir: string) => {
    setLoading(true);
    try {
      const res = await api.get('/api/files/browse', { params: { dir } });
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

  const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1A1A28', fontSize: 13, color: '#E0E0FF' };

  const selectNone = folderPicker && !currentDir;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#13131A', borderRadius: 12, border: '1px solid #2A2A3C', width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A3C' }}>
          <h3 style={{ color: '#E0E0FF', fontSize: 15, margin: '0 0 4px' }}>{title}</h3>
          <div style={{ color: '#6B6B80', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span onClick={goBack} style={{ cursor: history.length ? 'pointer' : 'default', color: history.length ? '#00F0FF' : '#6B6B80' }}>root</span>
            {currentDir && <><ChevronRight size={12} /><span>{currentDir}</span></>}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Loading...</div>
          ) : (
            <>
              {history.length > 0 && (
                <div style={row} onClick={goBack}>
                  <ChevronRight size={14} color="#6B6B80" style={{ transform: 'rotate(180deg)' }} />
                  <span style={{ color: '#6B6B80' }}>..</span>
                </div>
              )}
              {folders.map(f => (
                <div key={f.path} style={row} onClick={() => enterFolder(f.path)}>
                  <Folder size={16} color="#FCE205" />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  {folderPicker && (
                    <button onClick={e => { e.stopPropagation(); onSelect([], f.path); }} style={{
                      padding: '3px 10px', borderRadius: 4, background: '#00F0FF', color: '#09090E',
                      border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 11
                    }}>Pilih</button>
                  )}
                </div>
              ))}
              {showFilesFlag && files.map(f => (
                <div key={f.path} style={selectedFiles.has(f.path) ? { ...row, background: '#1A1A28' } : row} onClick={() => multiFile ? toggleFile(f.path) : onSelect([f.path], currentDir)}>
                  {multiFile && (
                    <span onClick={e => { e.stopPropagation(); toggleFile(f.path); }}>
                      {selectedFiles.has(f.path) ? <CheckSquare size={16} color="#00F0FF" /> : <Square size={16} color="#6B6B80" />}
                    </span>
                  )}
                  <File size={16} color="#6B6B80" />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span style={{ color: '#6B6B80', fontSize: 11, marginLeft: 8 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              ))}
              {files.length === 0 && folders.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Folder kosong</div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #2A2A3C', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {multiFile && files.length > 0 && (
              <button onClick={selectAll} style={{ padding: '6px 14px', borderRadius: 6, background: '#1F1F2C', color: '#E0E0FF', border: '1px solid #2A2A3C', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
                {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {!folderPicker && (
              <button onClick={() => onSelect([], currentDir)} style={{ padding: '6px 14px', borderRadius: 6, background: '#00FF88', color: '#09090E', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
                Proses Semua{currentDir ? ` (${currentDir})` : ''}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, background: '#1F1F2C', color: '#E0E0FF', border: '1px solid #2A2A3C', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>Batal</button>
            {folderPicker && !selectNone && (
              <button onClick={() => onSelect([], currentDir)} style={{ padding: '6px 14px', borderRadius: 6, background: '#00F0FF', color: '#09090E', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
                Pilih Folder Ini{currentDir ? ` (${currentDir})` : ''}
              </button>
            )}
            {multiFile && selectedFiles.size > 0 && (
              <button onClick={() => onSelect(Array.from(selectedFiles), currentDir)} style={{ padding: '6px 14px', borderRadius: 6, background: '#00F0FF', color: '#09090E', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
                Proses {selectedFiles.size} File
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
