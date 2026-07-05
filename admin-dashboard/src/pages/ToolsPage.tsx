import { useState } from 'react';
import { executeTool } from '../api/client';
import { Wrench, RefreshCw, Trash2, FileText, Music, Disc3 } from 'lucide-react';

const TOOLS = [
  { action: 'clean', icon: RefreshCw, label: 'Clean Names', desc: 'Bersihkan nama file dari label ZDT', color: '#00F0FF' },
  { action: 'playlist', icon: FileText, label: 'Generate Playlist', desc: 'Buat ZDT_Playlist.m3u dari file MP3', color: '#00FF88' },
  { action: 'sync_lyrics', icon: Music, label: 'Sync Lyrics', desc: 'Sync lirik ke semua file lagu', color: '#FCE205' },
  { action: 'compress', icon: Disc3, label: 'Compress Media', desc: 'Kompres video/audio dengan ffmpeg', color: '#FF8800' },
  { action: 'delete_all', icon: Trash2, label: 'Delete All Media', desc: 'HAPUS SEMUA file media di target dir', color: '#FF003C' },
];

export default function ToolsPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleTool = async (action: string) => {
    if (action === 'delete_all') {
      if (!confirm('Yakin ingin menghapus SEMUA file media? Aksi ini tidak bisa dibatalkan!')) return;
    }
    setRunning(action);
    setResult(null);
    try {
      const data = await executeTool(action);
      setResult(data.success ? 'Task ' + action + ' dimulai' : 'Gagal: ' + (data.error || 'Unknown'));
    } catch (e: any) {
      setResult('Error: ' + e.message);
    } finally {
      setRunning(null);
    }
  };

  const s = {
    title: { fontSize: 20, fontWeight: 'bold' as const, marginBottom: 24, color: '#E0E0FF' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
    card: {
      background: '#13131A', borderRadius: 12, padding: 20,
      border: '1px solid #2A2A3C', cursor: 'pointer',
      transition: 'all 0.15s',
    },
    iconBox: {
      padding: 8, borderRadius: 8, background: '#1F1F2C',
      display: 'inline-flex', marginBottom: 12,
    },
    label: { color: '#E0E0FF', fontWeight: 600, fontSize: 14, marginBottom: 4 },
    desc: { color: '#6B6B80', fontSize: 12, lineHeight: '1.4' },
    resultBox: {
      background: '#1F1F2C', borderRadius: 8, padding: 12,
      color: '#E0E0FF', fontSize: 13, marginTop: 16,
    },
  };

  return (
    <div>
      <h2 style={s.title}>
        <Wrench size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        Server Tools
      </h2>

      <div style={s.grid}>
        {TOOLS.map(tool => (
          <div
            key={tool.action}
            style={{...s.card, opacity: running?.startsWith(tool.action) ? 0.5 : 1}}
            onClick={() => !running && handleTool(tool.action)}
          >
            <div style={{...s.iconBox, background: tool.color + '22'}}>
              <tool.icon color={tool.color} size={20} />
            </div>
            <div style={s.label}>{tool.label}</div>
            <div style={s.desc}>{tool.desc}</div>
            {running === tool.action && <div style={{color: '#FCE205', fontSize: 12, marginTop: 8}}>Processing...</div>}
          </div>
        ))}
      </div>

      {result && <div style={s.resultBox}>{result}</div>}
    </div>
  );
}
