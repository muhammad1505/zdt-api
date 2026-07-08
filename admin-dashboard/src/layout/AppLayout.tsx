import { SidebarProvider, useSidebar } from '../context/SidebarContext';
import { Outlet } from 'react-router-dom';
import AppSidebar from '../components/Layout/Sidebar';
import AppHeader from './AppHeader';

interface Props {
  username: string;
  role: string;
  onLogout: () => void;
}

function LayoutContent({ username, role, onLogout }: Props) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-950">
      <AppSidebar userRole={role} />
      <div className={`flex-1 transition-all duration-300 ease-in-out pt-[57px] lg:pt-[61px] ${
        isExpanded || isHovered ? 'lg:ml-[290px]' : 'lg:ml-[90px]'
      } ${isMobileOpen ? 'ml-0' : ''}`}>
        <AppHeader username={username} onLogout={onLogout} />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ username, role, onLogout }: Props) {
  return (
    <SidebarProvider>
      <LayoutContent username={username} role={role} onLogout={onLogout} />
    </SidebarProvider>
  );
}
