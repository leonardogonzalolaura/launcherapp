import { ShortcutEntry } from './useKeyboardShortcuts';

export const ALL_SHORTCUTS: ShortcutEntry[] = [
  // Global
  { key: 'p', ctrl: true, label: 'Quick switch project', category: 'Global' },
  { key: 'p', ctrl: true, shift: true, label: 'Command palette', category: 'Global' },
  { key: 'd', ctrl: true, shift: true, label: 'Add custom command', category: 'Global' },
  { key: '/', ctrl: true, label: 'Shortcut help', category: 'Global' },
  { key: 'o', ctrl: true, shift: true, label: 'Project commands', category: 'Global' },
  { key: 'w', ctrl: true, label: 'Close active tab', category: 'Global' },
  { key: 'w', ctrl: true, shift: true, label: 'Close all tabs', category: 'Global' },
  { key: 'r', ctrl: true, label: 'Rerun stopped process', category: 'Global' },
  { key: 'Escape', label: 'Close modal / dismiss', category: 'Global' },

  // Console
  { key: 'l', ctrl: true, label: 'Clear console', category: 'Console' },
  { key: 'Delete', ctrl: true, label: 'Clear console (alt)', category: 'Console' },
  { key: 'f', ctrl: true, label: 'Search logs', category: 'Console' },
  { key: 'Escape', ctrl: true, label: 'Close log search', category: 'Console' },
  { key: 'Tab', ctrl: true, label: 'Next process tab', category: 'Console' },
  { key: 'Tab', ctrl: true, shift: true, label: 'Previous process tab', category: 'Console' },
  { key: '1', ctrl: true, label: 'Switch to tab #1', category: 'Console' },
  { key: '2', ctrl: true, label: 'Switch to tab #2', category: 'Console' },
  { key: '3', ctrl: true, label: 'Switch to tab #3', category: 'Console' },
  { key: '4', ctrl: true, label: 'Switch to tab #4', category: 'Console' },
  { key: '5', ctrl: true, label: 'Switch to tab #5', category: 'Console' },
  { key: '6', ctrl: true, label: 'Switch to tab #6', category: 'Console' },
  { key: '7', ctrl: true, label: 'Switch to tab #7', category: 'Console' },
  { key: '8', ctrl: true, label: 'Switch to tab #8', category: 'Console' },
  { key: '9', ctrl: true, label: 'Switch to tab #9', category: 'Console' },

  // Navigation
  { key: 'ArrowUp', label: 'Navigate up', category: 'Navigation' },
  { key: 'ArrowDown', label: 'Navigate down', category: 'Navigation' },
  { key: 'Enter', label: 'Confirm selection', category: 'Navigation' },
];
