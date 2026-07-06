import { useState, useEffect, useRef } from 'react';
import { Folder, Search, File, Disc3, Download, Play, Upload, RefreshCw } from 'lucide-react';
import api, { getStreamUrl, getDownloadUrl } from '../api/client';
import FileBrowser from '../components/FileBrowser';

function fmtSize(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetDir, setTargetDir] = useState('');
  const [showDirPicker, setShowDirPicker] = useState(false);
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

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/api/upload', form);
      fetch();
    } catch {}
    setUploading(false);
    if (ref.current) ref.current.value = '';
  };

  const handleDirSelected = (_files: string[], folder: string) => {
    setShowDirPicker(false);
    if (folder) {
      api.post('/api/settings/storage', { target_dir: folder });
      setTargetDir(folder);
    }
  };

  const input = { width: '100%', padding: '10px 14px', borderRadius: 8, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' };
  const card = { background: '#13131A', borderRadius: 12, padding: 16, marginBottom: 8, border: '1px solid #2A2A3C', display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center' as const };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#E0E0FF' }}>
        <Folder size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        Files
      </h2>

      {/* Search + Upload */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Search size={16} color="#6B6B80" />
        <input placeholder="Search files..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, flex: 1, maxWidth: 400, marginBottom: 0 }} />
        <span style={{ color: '#6B6B80', fontSize: 13 }}>{files.length} files</span>
        <button onClick={() => ref.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>
          <Upload size={16} /> Upload
        </button>
        <input ref={ref} type="file" hidden onChange={handleUpload} />
        <button onClick={fetch} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Target Directory */}
      <div style={{ background: '#13131A', borderRadius: 12, padding: '12px 16px', border: '1px solid #2A2A3C', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Disc3 size={16} color="#FCE205" />
        <span style={{ flex: 1, color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>{targetDir || 'Not set'}</span>
        <button onClick={() => setShowDirPicker(true)} style={{ padding: '4px 12px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Change</button>
      </div>

      {showDirPicker && (
        <FileBrowser
          title="Pilih Target Directory"
          onSelect={handleDirSelected}
          onCancel={() => setShowDirPicker(false)}
          folderPicker
        />
      )}

      {uploading && <div style={{ ...card, borderColor: '#FCE205', color: '#FCE205', fontSize: 13, marginBottom: 12 }}>Uploading...</div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Loading...</div>
      : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>{search ? 'No matches' : 'No files'}</div>
      : filtered.map(f => (
        <div key={f.path} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ padding: 8, borderRadius: 8, background: '#1F1F2C' }}><File color="#00F0FF" size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#E0E0FF', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 2 }}>{f.type.toUpperCase()} · {fmtSize(f.size)} · {new Date(f.modified * 1000).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus'].includes(f.type) && (
              <button onClick={() => setPreviewUrl(getStreamUrl(f.path))}
                style={{ padding: '6px 10px', background: '#00F0FF20', color: '#00F0FF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                <Play size={14} />
              </button>
            )}
            <a href={getDownloadUrl(f.path)} download
              style={{ padding: '6px 10px', background: '#00FF8820', color: '#00FF88', border: 'none', borderRadius: 6, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex' }}>
              <Download size={14} />
            </a>
          </div>
        </div>
      ))}

      {previewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPreviewUrl(null)}>
          <div onClick={e => e.stopPropagation()}>
            {previewUrl.match(/\.(mp4|mkv|webm)/i) ? (
              <video src={previewUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }} />
            ) : (
              <audio src={previewUrl} controls autoPlay style={{ width: 400 }} />
            )}
            <button onClick={() => setPreviewUrl(null)} style={{ display: 'block', margin: '16px auto 0', padding: '8px 20px', background: '#1F1F2C', color: '#E0E0FF', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
