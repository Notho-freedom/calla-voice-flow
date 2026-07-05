import { useState, useCallback, useEffect } from 'react';
import { ExplorerToaster } from './ExplorerToasts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider, useI18n, Locale } from '@/i18n/LanguageContext';
import { TabBar, TabState } from './TabBar';
import { ExplorerTab } from './ExplorerTab';
import { TerminalPanel } from './TerminalPanel';
import { CommandPalette } from './CommandPalette';
import { useSound } from '@/hooks/useSound';
import { cn } from '@/lib/utils';
import './explorer.css';

export interface FileExplorerProps {
  /** Real system path to open when running with the Electron bridge. */
  initialPath?: string;
  /** Increment to force the active embedded tab to sync to initialPath. */
  openToken?: number;
  /** Visual embedding mode. Standalone keeps NextGen chrome; Cognitive Stream supplies its own frame. */
  embeddedMode?: 'standalone' | 'cognitive-stream';
  /** Folder id to open the first tab in. Defaults to the virtual "This PC" view. */
  initialFolderId?: string;
  /** UI language. Defaults to 'fr'. */
  initialLocale?: Locale;
  /** Show the tab bar with mock window controls. Defaults to true. */
  showWindowChrome?: boolean;
  /** Optional wrapper className (e.g. height/width). */
  className?: string;
  /** Optional close handler used by hosts such as Cognitive Stream. */
  onClose?: () => void;
  /** Called whenever a file is opened (double-click on non-folder). */
  onFileOpen?: (folderId: string) => void;
  /** Called whenever the active tab navigates to a new folder. */
  onNavigate?: (folderId: string) => void;
}

function makeId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function ExplorerInner({
  initialFolderId = 'root',
  initialPath,
  openToken = 0,
  onNavigate,
}: {
  initialFolderId?: string;
  initialPath?: string;
  openToken?: number;
  onNavigate?: (id: string) => void;
}) {
  const { locale, setLocale } = useI18n();
  const { play } = useSound();
  const [tabs, setTabs] = useState<TabState[]>(() => [{ id: makeId(), folderId: initialFolderId }]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [cmdOpen, setCmdOpen] = useState(false);

  const newTab = useCallback(
    (folderId: string = 'root', kind: 'explorer' | 'terminal' = 'explorer') => {
      const id = makeId();
      setTabs((prev) => [...prev, { id, folderId, kind }]);
      setActiveId(id);
      play('tab-new');
    },
    [play]
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id);
        return next;
      });
    },
    [activeId]
  );

  // Global events: open new tab (folder), open terminal tab
  useEffect(() => {
    const onNewTab = (e: Event) => {
      const folderId = (e as CustomEvent<{ folderId?: string }>).detail?.folderId || 'root';
      newTab(folderId, 'explorer');
    };
    const onNewTerm = () => newTab('root', 'terminal');
    window.addEventListener('explorer:new-tab', onNewTab);
    window.addEventListener('explorer:new-terminal-tab', onNewTerm);
    return () => {
      window.removeEventListener('explorer:new-tab', onNewTab);
      window.removeEventListener('explorer:new-terminal-tab', onNewTerm);
    };
  }, [newTab]);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (ctrl && e.key.toLowerCase() === 't') {
        e.preventDefault();
        newTab();
      }
      if (ctrl && e.key.toLowerCase() === 'w' && tabs.length > 1) {
        e.preventDefault();
        closeTab(activeId);
      }
      if (ctrl && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (tabs[idx]) {
          e.preventDefault();
          setActiveId(tabs[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, tabs, newTab, closeTab]);

  const handleFolderChange = useCallback(
    (tabId: string, folderId: string) => {
      const currentTab = tabs.find((tab) => tab.id === tabId);
      if (currentTab?.folderId === folderId) return;
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, folderId } : t)));
      if (tabId === activeId) onNavigate?.(folderId);
    },
    [activeId, onNavigate, tabs]
  );

  return (
    <>
      <TabBar tabs={tabs} activeId={activeId} onActivate={setActiveId} onClose={closeTab} onNew={() => newTab()} />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          if (!isActive) return null;
          if (tab.kind === 'terminal') {
            return (
              <TerminalPanel
                key={tab.id}
                open
                fill
                cwd="root"
                cwdName="Terminal"
                onClose={() => closeTab(tab.id)}
                onCd={() => { /* noop in tab mode */ }}
                onMkdir={() => { /* noop in tab mode */ }}
              />
            );
          }
          return (
            <ExplorerTab
              key={tab.id}
              active={isActive}
              initialFolderId={tab.folderId}
              onFolderChange={(fid) => handleFolderChange(tab.id, fid)}
              onOpenCommandPalette={() => setCmdOpen(true)}
            />
          );
        })}
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onNavigate={(id) => {
          window.dispatchEvent(new CustomEvent('explorer-nav', { detail: { id } }));
        }}
        onTogglePreview={() => window.dispatchEvent(new CustomEvent('explorer-toggle-preview'))}
        onToggleHidden={() => window.dispatchEvent(new CustomEvent('explorer-toggle-hidden'))}
        onToggleLanguage={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
      />
    </>
  );
}

/**
 * `<FileExplorer />` — drop-in file explorer.
 *
 * Standalone usage:
 *   <FileExplorer />
 *
 * Embedded with custom height:
 *   <FileExplorer className="h-[600px]" initialLocale="en" />
 *
 * To port into another project, copy:
 *   - src/components/explorer/
 *   - src/hooks/{useFileExplorer,useFileOperations,useSound,useMarqueeSelection,useDragDrop,useGlobalClipboard,useNotifications}.ts
 *   - src/data/{mockFileSystem,localServers}.ts
 *   - src/types/fileExplorer.ts
 *   - src/lib/{sounds,iconCache,utils}.ts
 *   - src/i18n/
 *   - public/sounds/
 *   - shadcn/ui primitives used (button, dropdown-menu, dialog, sheet, popover, tooltip, slider, command, resizable, sonner, toast)
 */
export function FileExplorer({
  initialPath,
  openToken = 0,
  embeddedMode = 'standalone',
  initialFolderId = 'root',
  initialLocale = 'fr',
  showWindowChrome = true,
  className,
  onFileOpen,
  onNavigate,
}: FileExplorerProps = {}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <TooltipProvider delayDuration={400}>
        <div
          className={cn(
            'explorer-root flex flex-col bg-background overflow-hidden text-foreground',
            !className && 'h-screen',
            className
          )}
        >
          {showWindowChrome && embeddedMode === 'standalone' ? (
            <ExplorerInner initialFolderId={initialFolderId} initialPath={initialPath} openToken={openToken} onNavigate={onNavigate} />
          ) : (
            <ExplorerInner
              initialFolderId={initialFolderId}
              initialPath={initialPath}
              openToken={openToken}
              onNavigate={onNavigate}
            />
          )}
          {embeddedMode !== 'standalone' && !showWindowChrome && false && (
            <ExplorerTab
              active
              initialFolderId={initialFolderId}
              onFolderChange={(fid) => onNavigate?.(fid)}
              onOpenCommandPalette={() => {}}
            />
          )}
        </div>
        <ExplorerToaster />
      </TooltipProvider>
    </I18nProvider>
  );
}
