import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import api, { getProfile, updateProfile, changePassword, getNotifSettings, saveNotifSettings, getLastSeenNotifId, setLastSeenNotifId } from '../api/client';
import type { Activity } from '../utils/notifications';
import { fmtTime, eventLabel, notifGroupKey, notifGroupLabel, notifGroupIcon, playCategorySound, CATEGORIES, SOUND_PROFILES } from '../utils/notifications';

interface Props {
  username: string;
  onLogout: () => void;
}

export default function AppHeader({ username, onLogout }: Props) {
  const { toggleSidebar, toggleMobileSidebar, isMobileOpen } = useSidebar();
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Activity[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastNotifId = useRef<number>(0);
  const notifOpenRef = useRef(false);
  const [profileData, setProfileData] = useState<{ username: string; label: string; role: string } | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Notification preferences (synced with backend + localStorage fallback)
  const [notifSoundEnabled, setNotifSoundEnabled] = useState(
    localStorage.getItem('zdt_notif_sound') !== 'false'
  );
  const [notifDesktopEnabled, setNotifDesktopEnabled] = useState(
    localStorage.getItem('zdt_notif_desktop') !== 'false'
  );

  // Load notification settings from backend on mount (override localStorage)
  useEffect(() => {
    getNotifSettings().then(settings => {
      setNotifSoundEnabled(settings.sound);
      setNotifDesktopEnabled(settings.desktop);
      localStorage.setItem('zdt_notif_sound', String(settings.sound));
      localStorage.setItem('zdt_notif_desktop', String(settings.desktop));
    }).catch(() => {
      // Fallback — keep localStorage values
    });
  }, []);

  // Load last seen notification ID from backend on mount (cross-session unread tracking)
  useEffect(() => {
    getLastSeenNotifId().then(data => {
      if (data.last_seen_id > 0) {
        lastNotifId.current = data.last_seen_id;
      }
    }).catch(() => {});
  }, []);

  // Sound preview modal
  const [soundPreviewOpen, setSoundPreviewOpen] = useState(false);

  // Help modal for keyboard shortcuts
  const [helpOpen, setHelpOpen] = useState(false);

  const SHORTCUTS = [
    { key: 'T', description: 'Toggle dark/light theme' },
    { key: 'N', description: 'Toggle notification panel' },
    { key: '?', description: 'Show this help modal' },
  ];

  // Theme toggle
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark') ||
      localStorage.getItem('zdt_theme') === 'dark' ||
      (!localStorage.getItem('zdt_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('zdt_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('zdt_theme', 'light');
    }
  }, [isDark]);

  // Keyboard shortcuts — moved after toggleTheme definition so toggleTheme is in scope
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleTheme();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNotifOpen((prev: boolean) => !prev);
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((prev: boolean) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme]);

  // Notification sound — uses shared playCategorySound
  const playNotifSound = useCallback((category?: string) => {
    if (!notifSoundEnabled) return;
    playCategorySound(category || 'other');
  }, [notifSoundEnabled]);

  // Request desktop notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Real-time notification polling every 15 seconds
  // Keep notifOpenRef in sync with notifOpen state for the interval closure
  useEffect(() => {
    notifOpenRef.current = notifOpen;
  }, [notifOpen]);

  // Real-time notification polling every 15 seconds (backend-filtered)
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const since = lastNotifId.current > 0 ? `&since_id=${lastNotifId.current}` : '';
        const res = await api.get(`/api/admin/notifications?limit=20${since}`);
        const items: Activity[] = res.data.notifications || [];
        const unread = res.data.unread_count || 0;
        const maxId = res.data.max_id || 0;

        setNotifications(items);
        if (maxId > lastNotifId.current) {
          lastNotifId.current = maxId;
        }

        // Update unread count from server, play sound if new
        if (unread > 0 && !notifOpenRef.current) {
          setUnreadCount(prev => prev + unread);
          const newNotif = items.length > 0 ? items[0] : null;
          const category = newNotif ? notifGroupKey(newNotif) : undefined;
          playNotifSound(category);
          if (notifDesktopEnabled && newNotif && 'Notification' in window && Notification.permission === 'granted') {
            const isError = newNotif.status_code >= 400;
            new Notification('ZDT API' + (isError ? ' ⚠️' : ''), {
                body: eventLabel(newNotif),
                icon: '/favicon.svg',
                tag: 'zdt-notif',
              });
          }
        }
      } catch {}
    };

    // Initial fetch
    fetchNotifs();

    // Poll every 15 seconds
    const interval = setInterval(fetchNotifs, 15000);
    return () => clearInterval(interval);
  }, [playNotifSound, notifDesktopEnabled]);

  // Reset unread count when notification panel opens
  useEffect(() => {
    if (notifOpen) {
      setUnreadCount(0);
      // Refresh notifications when opening (no unread since it's just opened)
      api.get('/api/admin/notifications?limit=20').then(res => {
        setNotifications(res.data.notifications || []);
      }).catch(() => {});
      // Persist last seen ID to backend so unread count survives page refresh
      if (lastNotifId.current > 0) {
        setLastSeenNotifId(lastNotifId.current).catch(() => {});
      }
    }
  }, [notifOpen]);

  const handleToggle = () => {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  };

  const openProfile = async () => {
    setUserOpen(false);
    try {
      const res = await getProfile();
      const u = res.user;
      setProfileData(u);
      setEditLabel(u.label || '');
      setOldPass('');
      setNewPass('');
      setProfileOpen(true);
    } catch {}
  };

  const saveProfile = async () => {
    if (!profileData) return;
    try {
      await updateProfile({ label: editLabel });
      if (oldPass && newPass) {
        await changePassword(oldPass, newPass);
      }
      setProfileOpen(false);
      setOldPass(''); setNewPass('');
    } catch {}
  };

  return (
    <header className="fixed top-0 left-0 right-0 flex w-full bg-white border-gray-200 z-99999 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:border-b-0 lg:px-6 lg:py-4">
        <button
          onClick={handleToggle}
          className="items-center justify-center w-10 h-10 text-gray-500 border-gray-200 rounded-lg dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Toggle Sidebar"
        >
          {isMobileOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /></svg>
          </div>
          <span className="font-bold text-sm text-gray-800 dark:text-white/90">ZDT API</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">Admin Dashboard</span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Theme Toggle */}
          <div className="relative group">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-none cursor-pointer"
              aria-label="Toggle theme"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {/* Persistence indicator tooltip */}
            <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success-500 border border-white dark:border-gray-900"
              title="Theme saved to localStorage"
            />
            {/* Tooltip on hover */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-gray-900 dark:bg-gray-700 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm">
              {isDark ? 'Dark mode' : 'Light mode'} · Press <kbd className="px-1 py-0.5 rounded bg-gray-700 dark:bg-gray-600 text-[9px] font-mono">T</kbd>
            </div>
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-none cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {(unreadCount > 0 || notifications.length > 0) && (
                <span className={`absolute -top-1 -right-1 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-900 ${
                  unreadCount > 0
                    ? 'w-5 h-5 bg-error-500 text-white text-[9px] font-bold'
                    : 'w-3 h-3 bg-gray-400'
                }`}>
                  {unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : ''}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-theme-md py-3 z-[99999]">
                <div className="px-4 pb-2 mb-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Notifications</h4>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                      <>
                        <button
                          onClick={() => {
                            if (lastNotifId.current > 0) {
                              setLastSeenNotifId(lastNotifId.current).catch(() => {});
                            }
                            setUnreadCount(0);
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer transition-colors"
                        >
                          Mark read
                        </button>
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                        <button
                          onClick={() => {
                            api.post('/api/admin/activity/clear').then(() => {
                              setNotifications([]);
                              setUnreadCount(0);
                            }).catch(() => {});
                          }}
                          className="text-xs text-gray-400 hover:text-error-500 dark:hover:text-error-400 bg-transparent border-none cursor-pointer transition-colors"
                        >
                          Clear all
                        </button>
                      </>
                    )}
                    <Link to="/notifications" className="text-xs text-brand-500 hover:underline no-underline">View all</Link>
                  </div>
                </div>
                {/* Notification preferences toggles */}
                <div className="px-4 pb-3 mb-2 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-500 dark:text-gray-400">
                    <input type="checkbox" checked={notifSoundEnabled}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setNotifSoundEnabled(v);
                        localStorage.setItem('zdt_notif_sound', String(v));
                        saveNotifSettings({ sound: v }).catch(() => {});
                      }}
                      className="w-3.5 h-3.5 accent-amber-500" />
                    Sound
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-500 dark:text-gray-400">
                    <input type="checkbox" checked={notifDesktopEnabled}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setNotifDesktopEnabled(v);
                        localStorage.setItem('zdt_notif_desktop', String(v));
                        saveNotifSettings({ desktop: v }).catch(() => {});
                      }}
                      className="w-3.5 h-3.5 accent-amber-500" />
                    Desktop
                  </label>
                  <button
                    onClick={() => setSoundPreviewOpen(true)}
                    className="text-xs text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 cursor-pointer transition-colors"
                    title="Preview individual notification sounds"
                  >
                    Test sounds
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">No notifications</div>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto">
                    {(() => {
                      // Group notifications by type
                      const groups: Record<string, Activity[]> = {};
                      for (const a of notifications) {
                        const key = notifGroupKey(a);
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(a);
                      }
                      return Object.entries(groups).map(([key, items]) => {
                        const latest = items.reduce((a, b) => a.id > b.id ? a : b);
                        const isErrorGroup = key === 'errors';
                        return (
                          <div key={key}>
                            {/* Group header */}
                            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-50/80 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50">
                              <span className="text-[11px]">{notifGroupIcon(key)}</span>
                              <span className={`text-[11px] font-semibold uppercase tracking-wider ${isErrorGroup ? 'text-error-600 dark:text-error-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                {notifGroupLabel(key)}
                              </span>
                              <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isErrorGroup ? 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                {items.length}
                              </span>
                            </div>
                            {/* Latest item in group */}
                            <div className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                              <div className="flex items-start gap-2.5">
                                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${isErrorGroup ? 'bg-error-500' : 'bg-success-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-800 dark:text-white/90 font-medium truncate">{eventLabel(latest)}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {latest.status_code >= 400 ? `Error ${latest.status_code}` : latest.status_code} · {fmtTime(latest.created_at)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Dropdown */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen(!userOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-none cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-medium text-gray-800 dark:text-white/90 -mt-0.5">{username}</div>
                <div className="text-[10px] text-gray-400">Administrator</div>
              </div>
              <svg className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${userOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-theme-md py-2 z-[99999]">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{username}</div>
                    <div className="text-xs text-gray-400">@{username.toLowerCase()}</div>
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={openProfile}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-none cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Profile
                  </button>
                  <button onClick={openProfile}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-none cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    Account Settings
                  </button>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1">
                  <button
                    onClick={() => { setUserOpen(false); onLogout(); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-none cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]" onClick={() => setHelpOpen(false)}>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 w-[340px] max-w-[95vw] shadow-theme-md py-5 px-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Keyboard Shortcuts</h3>
              <button onClick={() => setHelpOpen(false)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer transition-colors">
                Close
              </button>
            </div>
            <div className="space-y-2">
              {SHORTCUTS.map(s => (
                <div key={s.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="text-xs text-gray-600 dark:text-gray-300">{s.description}</span>
                  <kbd className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs font-mono text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 min-w-[24px] text-center">{s.key}</kbd>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[10px] text-gray-400 text-center">
              Shortcuts are disabled when typing in input fields
            </div>
          </div>
        </div>
      )}

      {/* Sound Preview Modal */}
      {soundPreviewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]" onClick={() => setSoundPreviewOpen(false)}>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 w-[380px] max-w-[95vw] shadow-theme-md py-5 px-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Notification Sounds</h3>
              <button onClick={() => setSoundPreviewOpen(false)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer transition-colors">
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.filter(c => c !== 'other').map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    if (notifSoundEnabled) {
                      playCategorySound(cat);
                    }
                  }}
                  disabled={!notifSoundEnabled}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-xs">{notifGroupIcon(cat)}</span>
                  <span className="flex-1 text-left">{notifGroupLabel(cat)}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{SOUND_PROFILES[cat].freq}Hz</span>
                </button>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-gray-400 text-center">
              {notifSoundEnabled ? 'Click a category to preview its sound' : 'Enable Sound toggle above to preview'}
            </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {profileOpen && profileData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]" onClick={() => setProfileOpen(false)}>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 w-[440px] max-w-[95vw] shadow-theme-md py-6 px-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-5">Edit Profile</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Username</label>
                <input value={profileData.username} disabled
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm outline-none box-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Display Name / Label</label>
                <input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Your display name"
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">Change Password (optional)</h4>
                <div className="space-y-3">
                  <input value={oldPass} onChange={e => setOldPass(e.target.value)} type="password" placeholder="Current password"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
                  <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" placeholder="New password"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setProfileOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
              <button onClick={saveProfile}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
