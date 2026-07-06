import { useState, useEffect, useRef } from 'react';
import { executeTool } from '../api/client';
import api from '../api/client';
import { Wrench, RefreshCw, Trash2, FileText, Music, Disc3, MicOff, Terminal } from 'lucide-react';
import FileBrowser from '../components/FileBrowser';
import Swal from 'sweetalert2';

const TOOLS = [
  { action: 'clean', icon: RefreshCw, label: 'Clean Names', desc: 'Bersihkan nama file dari label ZDT, bisa pilih folder tertentu', color: '#00F0FF' },
  { action: 'playlist', icon: FileText, label: 'Generate Playlist', desc: 'Buat ZDT_Playlist.m3u dari file MP3', color: '#00FF88' },
  { action: 'sync_lyrics', icon: Music, label: 'Sync Lyrics', desc: 'Sync lirik ke semua file lagu, bisa pilih folder tertentu', color: '#FCE205' },
  { action: 'compress', icon: Disc3, label: 'Compress Media', desc: 'Kompres video/audio dengan ffmpeg, pilih file atau folder', color: '#FF8800' },
  { action: 'demucs', icon: MicOff, label: 'Remove Vocal', desc: 'Pisah vokal dari instrumen pake AI Demucs, pilih file atau folder', color: '#FF00FF' },
  { action: 'delete_all', icon: Trash2, label: 'Delete All Media', desc: 'HAPUS SEMUA file media di target dir atau folder tertentu', color: '#FF003C' },
];

const BROWSER_TOOLS = new Set(['clean', 'sync_lyrics', 'compress', 'demucs', 'delete_all']);
const MULTI_FILE = new Set(['compress', 'demucs']);

const SYNC_TOOLS = new Set(['playlist']);

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, background: '#13131A', color: '#E0E0FF' });
}

const DONE_PATTERNS = ['done', 'selesai', 'deleted', 'created', 'playlist created'];

export default function ToolsPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [taskRunning, setTaskRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevTaskRunning = useRef(false);
  const currentAction = useRef<string | null>(null);
  const notified = useRef(false);

  const clearLog = async () => {
    try { await api.post('/api/logs/clear'); } catch {}
  };

  const checkDone = (action: string, logLines: string[], subprocRunning: boolean) => {
    if (notified.current) return;
    const last = logLines.filter(Boolean).pop()?.toLowerCase() || '';

    const hasDoneWord = DONE_PATTERNS.some(p => last.includes(p));
    const hasError = last.includes('error') || last.includes('gagal');

    if (hasError) {
      toast('error', `${action} gagal`);
      notified.current = true;
      setRunning(null);
      currentAction.current = null;
      return;
    }

    if (hasDoneWord) {
      toast('success', `${action} selesai`);
      notified.current = true;
      setRunning(null);
      currentAction.current = null;
      return;
    }

    if (!subprocRunning && prevTaskRunning.current) {
      toast('success', `${action} selesai`);
      notified.current = true;
      setRunning(null);
      currentAction.current = null;
      return;
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/api/logs');
      const lines: string[] = (res.data.logs || []).map((l: any) => l.line);
      const subRunning = !!res.data.running;
      setLogs(lines);
      setTaskRunning(subRunning);

      if (currentAction.current && !notified.current) {
        checkDone(currentAction.current, lines, subRunning);
      }
      prevTaskRunning.current = subRunning;
    } catch {}
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const [confirm, setConfirm] = useState<{ action: string; label: string; desc: string; color: string } | null>(null);
  const [showBrowser, setShowBrowser] = useState<{ action: string; color: string } | null>(null);

  const runTool = async (action: string, files?: string[], folder?: string) => {
    setRunning(action);
    currentAction.current = action;
    notified.current = false;
    prevTaskRunning.current = false;
    await clearLog();
    setConfirm(null);
    setShowBrowser(null);
    try {
      const firstFile = files && files.length > 0 ? files[0] : undefined;
      const data = await executeTool(action, firstFile, folder || undefined);
      if (!data.success) {
        toast('error', `${action}: ${data.error || 'Gagal'}`);
        setRunning(null);
        currentAction.current = null;
        notified.current = true;
        return;
      }
      if (SYNC_TOOLS.has(action)) {
        setTimeout(() => fetchLogs(), 500);
      }
    } catch (e: any) {
      toast('error', `${action}: ${e.message}`);
      setRunning(null);
      currentAction.current = null;
      notified.current = true;
    }
  };

  const handleBrowserSelect = (files: string[], folder: string) => {
    if (showBrowser) {
      runTool(showBrowser.action, files, folder);
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
    iconBox: { padding: 8, borderRadius: 8, background: '#1F1F2C', display: 'inline-flex', marginBottom: 12 },
    label: { color: '#E0E0FF', fontWeight: 600, fontSize: 14, marginBottom: 4 },
    desc: { color: '#6B6B80', fontSize: 12, lineHeight: '1.4' },
  };

  const needsFile = (a: string) => a === 'compress' || a === 'demucs';
  const toolIcon = (action: string, color: string) => {
    const t = TOOLS.find(x => x.action === action);
    return t ? <t.icon size={18} color={color} /> : null;
  };

  const openTool = (tool: typeof TOOLS[number]) => {
    if (running) return;
    if (BROWSER_TOOLS.has(tool.action)) {
      setShowBrowser({ action: tool.action, color: tool.color });
    } else {
      setConfirm({ action: tool.action, label: tool.label, desc: tool.desc, color: tool.color });
    }
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
            onClick={() => openTool(tool)}
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

      {showBrowser && (
        <FileBrowser
          title={TOOLS.find(t => t.action === showBrowser.action)?.label || 'Pilih File'}
          onSelect={handleBrowserSelect}
          onCancel={() => setShowBrowser(null)}
          multiFile={MULTI_FILE.has(showBrowser.action)}
          showFiles={needsFile(showBrowser.action)}
        />
      )}

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#13131A', borderRadius: 12, padding: 24, border: '1px solid #2A2A3C', width: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ padding: 6, borderRadius: 8, background: confirm.color + '22' }}>
                {toolIcon(confirm.action, confirm.color)}
              </div>
              <h3 style={{ color: '#E0E0FF', fontSize: 16, margin: 0 }}>{confirm.label}</h3>
            </div>
            <p style={{ color: '#6B6B80', fontSize: 13, margin: '0 0 16px', lineHeight: '1.5' }}>{confirm.desc}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirm(null)}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#1F1F2C', color: '#E0E0FF', border: '1px solid #2A2A3C', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
                Batal
              </button>
              <button onClick={() => runTool(confirm.action)}
                style={{ padding: '8px 18px', borderRadius: 8, background: confirm.color, color: '#09090E', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {(running || logs.length > 0 || taskRunning) && (
        <div style={{
          background: running ? '#1F1F2C' : '#13131A',
          borderRadius: 12,
          border: '1px solid ' + (running ? '#FCE205' : '#2A2A3C'),
          marginTop: 20, overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px', borderBottom: '1px solid #1F1F2C'
          }}>
            <Terminal size={16} color={running ? '#FCE205' : '#6B6B80'} />
            <span style={{ color: running ? '#FCE205' : '#6B6B80', fontSize: 13, fontWeight: 'bold' }}>
              {running ? `Processing ${running}...` : 'Task Log'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={fetchLogs} style={{
                padding: '4px 8px', background: '#09090E', color: '#6B6B80',
                border: '1px solid #2A2A3C', borderRadius: 4, cursor: 'pointer', fontSize: 11
              }}><RefreshCw size={12} /></button>
            </span>
          </div>
          <div ref={logRef} style={{
            padding: 16, maxHeight: 300, overflow: 'auto',
            fontFamily: 'monospace', fontSize: 12, color: '#E0E0FF',
            lineHeight: '1.6', background: '#09090E'
          }}>
            {logs.length === 0 ? (
              <span style={{ color: '#6B6B80' }}>No log entries yet.</span>
            ) : logs.map((line, i) => (
              <div key={i} style={{
                color: line.includes('ERROR') || line.includes('Error') || line.includes('gagal') ? '#FF003C'
                     : line.includes('WARNING') ? '#FCE205'
                     : line.includes('INFO') ? '#00F0FF'
                     : '#E0E0FF'
              }}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
