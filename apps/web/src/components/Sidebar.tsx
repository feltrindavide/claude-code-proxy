import { SidebarHeader } from './SidebarHeader';
import { SidebarNav } from './SidebarNav';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  return (
    <aside className="w-60 bg-surface-card border-r border-hairline flex flex-col">
      <SidebarHeader />
      <SidebarNav />
      <div className="p-md border-t border-hairline">
        <ThemeToggle />
      </div>
    </aside>
  );
}
