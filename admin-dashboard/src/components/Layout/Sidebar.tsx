import { useCallback } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Folder, Key, Users, Wrench, Sliders, ScrollText, Bell,
  Server, Menu, X
} from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';

const mainItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', adminOnly: false },
  { to: '/files', icon: Folder, label: 'Files', adminOnly: false },
  { to: '/keys', icon: Key, label: 'API Keys', adminOnly: true },
  { to: '/users', icon: Users, label: 'Users', adminOnly: true },
  { to: '/tools', icon: Wrench, label: 'Tools', adminOnly: false },
  { to: '/settings', icon: Sliders, label: 'Settings', adminOnly: true },
  { to: '/logs', icon: ScrollText, label: 'Logs', adminOnly: false },
  { to: '/notifications', icon: Bell, label: 'Notif History', adminOnly: false },
];

export default function Sidebar({ userRole = 'operator' }: { userRole?: string }) {
  const { isExpanded, isMobileOpen, isHovered, toggleMobileSidebar, setIsHovered } = useSidebar();
  const location = useLocation();
  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);
  const isAdmin = userRole === 'admin';
  const visibleItems = mainItems.filter(item => !item.adminOnly || isAdmin);

  const sidebarWidth = isExpanded || isHovered || isMobileOpen ? 'w-[290px]' : 'w-[90px]';

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-3 left-3 z-[99999] p-2 rounded-lg bg-surface border border-border text-primary"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={toggleMobileSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 dark:text-white transition-all duration-300 ease-in-out z-50 border-r border-gray-200 flex flex-col
          ${sidebarWidth}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${!isExpanded && !isHovered && !isMobileOpen ? 'lg:w-[90px]' : ''}`}
        onMouseEnter={() => !isExpanded && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Logo */}
        <div className={`py-8 flex ${!isExpanded && !isHovered && !isMobileOpen ? 'lg:justify-center' : 'justify-start'} px-5`}>
          <Link to="/" className="flex items-center gap-3 no-underline">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Server size={18} className="text-white" />
            </div>
            {(isExpanded || isHovered || isMobileOpen) && (
              <div>
                <div className="font-bold text-base text-gray-800 dark:text-white/90">ZDT API</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 -mt-0.5">Admin Dashboard</div>
              </div>
            )}
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4">
          <div className="mb-4">
            <h2 className={`mb-3 text-xs uppercase tracking-wide text-gray-400 ${!isExpanded && !isHovered && !isMobileOpen ? 'lg:text-center' : ''}`}>
              {(isExpanded || isHovered || isMobileOpen) ? 'Menu' : '•••'}
            </h2>
            <ul className="flex flex-col gap-1">
              {mainItems.map(item => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => isMobileOpen && toggleMobileSidebar()}
                    className={`menu-item group ${isActive(item.to) ? 'menu-item-active' : 'menu-item-inactive'}
                      ${!isExpanded && !isHovered && !isMobileOpen ? 'lg:justify-center' : 'lg:justify-start'}`}
                  >
                    <span className={`menu-item-icon-size ${isActive(item.to) ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}`}>
                      <item.icon size={22} />
                    </span>
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <span className="menu-item-text">{item.label}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </aside>
    </>
  );
}
