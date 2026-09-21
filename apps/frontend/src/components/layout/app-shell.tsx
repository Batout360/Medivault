'use client';

import * as React from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * AppShell — main authenticated layout.
 *
 * Desktop: fixed sidebar (collapsible) + scrollable main content area.
 * Mobile: sidebar hidden by default, slides in as a drawer with an overlay.
 */
export function AppShell({ children, title }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  // Close mobile sidebar on resize to desktop
  React.useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 1024) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ─── Desktop Sidebar ─────────────────────────────────────────── */}
      <div className="hidden lg:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      </div>

      {/* ─── Mobile Sidebar (Drawer) ──────────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-nav bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-modal lg:hidden animate-in slide-in-from-left duration-300">
            <Sidebar
              collapsed={false}
              onCollapsedChange={() => {}}
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </>
      )}

      {/* ─── Main Area ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          onMenuClick={() => setMobileSidebarOpen(true)}
          title={title}
        />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          tabIndex={-1}
        >
          <div className="w-full p-4 sm:p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
