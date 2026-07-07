import { useState, useEffect, useRef } from 'react';
import { executeTool } from '../api/client';
import api from '../api/client';
import { RefreshCw, Trash2, FileText, Music, Disc3, MicOff, Terminal, RotateCw } from 'lucide-react';
import FileBrowser from '../components/FileBrowser';
import Swal from 'sweetalert2';

const TOOLS = [
  { action: 'clean', icon: RefreshCw, label: 'Clean Names', desc: 'Bersihkan nama file dari label ZDT, bisa pilih folder tertentu', color: '#465fff' },
  { action: 'playlist', icon: FileText, label: 'Generate Playlist', desc: 'Buat ZDT_Playlist.m3u dari file MP3', color: '#12b76a' },
  { action: 'sync_lyrics', icon: Music, label: 'Sync Lyrics', desc: 'Sync lirik ke semua file lagu, bisa pilih folder tertentu', color: '#f79009' },
  { action: 'compress', icon: Disc3, label: 'Compress Media', desc: 'Kompres video/audio dengan ffmpeg, pilih file atau folder', color: '#f97066' },
  { action: 'demucs', icon: MicOff, label: 'Remove Vocal', desc: 'Pisah vokal dari instrumen pake AI Demucs, pilih file atau folder', color: '#ee46bc' },
  { action: 'delete_all', icon: Trash2, label: 'Delete All Media', desc: 'HAPUS SEMUA file media di target dir atau folder tertentu', color: '#f04438' },
];

const BROWSER_TOOLS = new Set(['clean', 'sync_lyrics', 'compress', 'demucs', 'delete_all']);
const MULTI_FILE = new Set(['compress', 'demucs']);
const SYNC_TOOLS = new Set(['playlist']);
const DONE_PATTERNS = ['done', 'selesai', 'deleted', 'created', 'playlist created'];

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, background: '#ffffff', color: '#1d2939', customClass: { container: '!z-[999999]' } });
}

export default function ToolsPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [taskRunning, setTaskRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevTaskRunning = useRef(false);
  const currentAction = useRef<string | null>(null);
  const notified = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; label: string; desc: string; color: string } | null>(null);
  const [showBrowser, setShowBrowser] = useState<{ action: string; color: string } | null>(null);

  const clearLog = async () => { try { await api.post('/api/logs/clear'); } catch {} };

  const checkDone = (action: string, logLines: string[], subprocRunning: boolean) => {
    if (notified.current) return;
    const last = logLines.filter(Boolean).pop()?.toLowerCase() || '';
    const hasDoneWord = DONE_PATTERNS.some(p => last.includes(p));
    const hasError = last.includes('error') || last.includes('gagal');
    if (hasError) { toast('error', `${action} gagal`); notified.current = true; setRunning(null); currentAction.current = null; return; }
    if (hasDoneWord) { toast('success', `${action} selesai`); notified.current = true; setRunning(null); currentAction.current = null; return; }
    if (!subprocRunning && prevTaskRunning.current) { toast('success', `${action} selesai`); notified.current = true; setRunning(null); currentAction.current = null; return; }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/api/logs');
      const lines: string[] = (res.data.logs || []).map((l: any) => l.line);
      const subRunning = !!res.data.running;
      setLogs(lines); setTaskRunning(subRunning);
      if (currentAction.current && !notified.current) checkDone(currentAction.current, lines, subRunning);
      prevTaskRunning.current = subRunning;
      if (!subRunning && !currentAction.current && lines.length > 0) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => { clearLog(); setLogs([]); }, 8000);
      } else { if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; } }
    } catch {}
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const start = () => { clearInterval(interval); fetchLogs(); interval = setInterval(fetchLogs, 2000); };
    const onVis = () => { if (!document.hidden) start(); };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  const runTool = async (action: string, files?: string[], folder?: string) => {
    setRunning(action); currentAction.current = action; notified.current = false; prevTaskRunning.current = false;
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; }
    await clearLog(); setConfirm(null); setShowBrowser(null);
    try {
      const firstFile = files && files.length > 0 ? files[0] : undefined;
      const data = await executeTool(action, firstFile, folder || undefined);
      if (!data.success) { toast('error', `${action}: ${data.error || 'Gagal'}`); setRunning(null); currentAction.current = null; notified.current = true; return; }
      if (SYNC_TOOLS.has(action)) setTimeout(() => fetchLogs(), 500);
    } catch (e: any) { toast('error', `${action}: ${e.message}`); setRunning(null); currentAction.current = null; notified.current = true; }
  };

  const handleBrowserSelect = (files: string[], folder: string) => {
    if (showBrowser) runTool(showBrowser.action, files, folder);
  };

  const needsFile = (a: string) => a === 'compress' || a === 'demucs';

  const openTool = (tool: typeof TOOLS[number]) => {
    if (running) return;
    if (BROWSER_TOOLS.has(tool.action)) setShowBrowser({ action: tool.action, color: tool.color });
    else setConfirm({ action: tool.action, label: tool.label, desc: tool.desc, color: tool.color });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Server Tools</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Run maintenance and processing tools</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.action}
              className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6 cursor-pointer transition-all duration-150 hover:shadow-theme-sm ${
                running?.startsWith(tool.action) ? 'opacity-50 pointer-events-none' : ''
              }`}
              onClick={() => openTool(tool)}
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: tool.color + '15' }}>
                <Icon size={22} style={{ color: tool.color }} />
              </div>
              <h3 className="text-base font-medium text-gray-800 dark:text-white/90 mb-1">{tool.label}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{tool.desc}</p>
              {running === tool.action && <div className="text-xs text-warning-600 dark:text-warning-500 mt-3 font-medium">Processing...</div>}
            </div>
          );
        })}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 w-[420px] max-w-[90%] shadow-theme-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ background: confirm.color + '20' }}>
                {(() => {
                  const t = TOOLS.find(x => x.action === confirm.action);
                  return t ? <t.icon size={20} style={{ color: confirm.color }} /> : null;
                })()}
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 m-0">{confirm.label}</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 m-0 mb-4 leading-relaxed">{confirm.desc}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Batal</button>
              <button onClick={() => runTool(confirm.action)}
                className="px-4 py-2 rounded-lg border-none cursor-pointer text-white text-sm font-medium hover:brightness-110 transition-all"
                style={{ background: confirm.color }}>Konfirmasi</button>
            </div>
          </div>
        </div>
      )}

      {(running || logs.length > 0 || taskRunning) && (
        <div className={`fixed bottom-5 right-5 z-[99999] w-[480px] max-h-80 rounded-2xl border overflow-hidden flex flex-col shadow-theme-lg ${
          running ? 'border-warning-300 dark:border-warning-500/40' : 'border-gray-200 dark:border-gray-700'
        } bg-white dark:bg-gray-900`}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <Terminal size={14} className={running ? 'text-warning-600 dark:text-warning-500' : 'text-gray-500 dark:text-gray-400'} />
            <span className={`text-xs font-semibold flex-1 ${running ? 'text-warning-600 dark:text-warning-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {running ? `Processing ${running}...` : 'Task Log'}
            </span>
            <button onClick={fetchLogs}
              className="p-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 cursor-pointer text-[10px] hover:text-gray-700 dark:hover:text-gray-300 transition-colors"><RotateCw size={11} /></button>
          </div>
          <div ref={logRef} className="flex-1 p-3 overflow-auto font-mono text-xs leading-relaxed bg-gray-50 dark:bg-gray-950" style={{ maxHeight: 240 }}>
            {logs.length === 0 ? (
              <span className="text-gray-500 dark:text-gray-400">No log entries yet.</span>
            ) : logs.map((line, i) => (
              <div key={i} className={
                line.includes('ERROR') || line.includes('Error') || line.includes('gagal') ? 'text-error-600 dark:text-error-500'
                : line.includes('WARNING') ? 'text-warning-600 dark:text-warning-500'
                : line.includes('INFO') ? 'text-brand-600 dark:text-brand-400'
                : 'text-gray-800 dark:text-white/90'
              }>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
