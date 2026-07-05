import { useState, useEffect } from 'react';
import { getConfig, updateConfig } from '../api/client';
import { Settings, Save } from 'lucide-react';

export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    getConfig().then(d => setConfig(d.config)).catch(() => {});
  }, []);

  const handleSave = async (key: string) => {
    try {
      await updateConfig(key, editValue);
      setConfig(prev => ({ ...prev, [key]: editValue }));
      setEditKey(null);
    } catch {}
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24, color: '#E0E0FF' }}>
        <Settings size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        System Config
      </h2>

      <div style={{ background: '#13131A', borderRadius: 12, border: '1px solid #2A2A3C', overflow: 'hidden' }}>
        {Object.entries(config).map(([key, value]) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px',
            borderBottom: '1px solid #1F1F2C', gap: 12
          }}>
            <code style={{ color: '#00F0FF', fontSize: 13, minWidth: 200, fontFamily: 'monospace' }}>
              {key}
            </code>
            {editKey === key ? (
              <>
                <input value={editValue} onChange={e => setEditValue(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 4, background: '#09090E', border: '1px solid #00F0FF', color: '#E0E0FF', fontSize: 13 }} />
                <button onClick={() => handleSave(key)}
                  style={{ padding: '6px 12px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  <Save size={14} />
                </button>
                <button onClick={() => setEditKey(null)}
                  style={{ padding: '6px 12px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 4, cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>
                  {value}
                </span>
                <button onClick={() => { setEditKey(key); setEditValue(value); }}
                  style={{ padding: '4px 10px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
