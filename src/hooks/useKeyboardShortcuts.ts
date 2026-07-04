import { useEffect } from 'react';

export interface ShortcutEntry {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;
  category: 'Global' | 'Console' | 'Navigation' | 'Modal';
}

export interface ShortcutDef extends ShortcutEntry {
  handler: (e: KeyboardEvent) => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[], deps: React.DependencyList = []) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = s.alt ? e.altKey : !e.altKey;
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault();
          e.stopPropagation();
          s.handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, ...deps]);
}

export function formatShortcut(entry: ShortcutEntry): string {
  const parts: string[] = [];
  if (entry.ctrl) parts.push('Ctrl');
  if (entry.shift) parts.push('Shift');
  if (entry.alt) parts.push('Alt');
  parts.push(entry.key === ' ' ? 'Space' : entry.key.toUpperCase());
  return parts.join(' + ');
}
