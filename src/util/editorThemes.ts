import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export type EditorTheme =
  | 'auto'
  | 'github-dark'
  | 'github-light'
  | 'one-dark'
  | 'dracula'
  | 'monokai'
  | 'nord'
  | 'solarized-light'
  | 'gruvbox-dark'
  | 'tokyo-night';

export const EDITOR_THEMES: { id: EditorTheme; label: string }[] = [
  { id: 'auto', label: 'Auto (tema app)' },
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'github-light', label: 'GitHub Light' },
  { id: 'one-dark', label: 'One Dark' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'nord', label: 'Nord' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'solarized-light', label: 'Solarized Light' },
];

interface ThemeDef {
  id: EditorTheme;
  label: string;
  dark: boolean;
  bg: string;
  fg: string;
  gutterBg: string;
  gutterFg: string;
  gutterBorder: string;
  activeLine: string;
  selection: string;
  cursor: string;
  keywords: string;
  strings: string;
  functions: string;
  variables: string;
  numbers: string;
  comments: string;
  types: string;
  operators: string;
  constants: string;
  invalid: string;
  link: string;
}

const THEMES: ThemeDef[] = [
  {
    id: 'github-dark', label: 'GitHub Dark', dark: true,
    bg: '#0d1117', fg: '#c9d1d9',
    gutterBg: '#0d1117', gutterFg: '#8b949e', gutterBorder: '#21262d',
    activeLine: '#161b22', selection: '#264f78', cursor: '#c9d1d9',
    keywords: '#ff7b72', strings: '#a5d6ff', functions: '#d2a8ff',
    variables: '#ffa657', numbers: '#79c0ff', comments: '#8b949e',
    types: '#ffa657', operators: '#c9d1d9', constants: '#79c0ff',
    invalid: '#f85149', link: '#58a6ff',
  },
  {
    id: 'github-light', label: 'GitHub Light', dark: false,
    bg: '#ffffff', fg: '#24292f',
    gutterBg: '#f6f8fa', gutterFg: '#6e7781', gutterBorder: '#d0d7de',
    activeLine: '#eaeef2', selection: '#c8e1ff', cursor: '#24292f',
    keywords: '#cf222e', strings: '#0a3069', functions: '#8250df',
    variables: '#953800', numbers: '#0550ae', comments: '#6e7781',
    types: '#953800', operators: '#24292f', constants: '#0550ae',
    invalid: '#d1242f', link: '#0969da',
  },
  {
    id: 'one-dark', label: 'One Dark', dark: true,
    bg: '#282c34', fg: '#abb2bf',
    gutterBg: '#282c34', gutterFg: '#6b747f', gutterBorder: '#393f4a',
    activeLine: '#2c313a', selection: '#3e4451', cursor: '#528bff',
    keywords: '#c678dd', strings: '#98c379', functions: '#61afef',
    variables: '#d19a66', numbers: '#d19a66', comments: '#5c6370',
    types: '#e5c07b', operators: '#56b6c2', constants: '#d19a66',
    invalid: '#e06c75', link: '#61afef',
  },
  {
    id: 'dracula', label: 'Dracula', dark: true,
    bg: '#282a36', fg: '#f8f8f2',
    gutterBg: '#282a36', gutterFg: '#6272a4', gutterBorder: '#3d4051',
    activeLine: '#2f3241', selection: '#44475a', cursor: '#f8f8f2',
    keywords: '#ff79c6', strings: '#f1fa8c', functions: '#50fa7b',
    variables: '#f8f8f2', numbers: '#bd93f9', comments: '#6272a4',
    types: '#8be9fd', operators: '#ff79c6', constants: '#bd93f9',
    invalid: '#ff5555', link: '#8be9fd',
  },
  {
    id: 'monokai', label: 'Monokai', dark: true,
    bg: '#272822', fg: '#f8f8f2',
    gutterBg: '#272822', gutterFg: '#6f6f6e', gutterBorder: '#3e3d32',
    activeLine: '#3e3d32', selection: '#49483e', cursor: '#f8f8f0',
    keywords: '#f92672', strings: '#e6db74', functions: '#a6e22e',
    variables: '#f8f8f2', numbers: '#ae81ff', comments: '#75715e',
    types: '#66d9ef', operators: '#f92672', constants: '#ae81ff',
    invalid: '#f92672', link: '#66d9ef',
  },
  {
    id: 'nord', label: 'Nord', dark: true,
    bg: '#2e3440', fg: '#d8dee9',
    gutterBg: '#2e3440', gutterFg: '#4c566a', gutterBorder: '#3b4252',
    activeLine: '#3b4252', selection: '#434c5e', cursor: '#d8dee9',
    keywords: '#81a1c1', strings: '#a3be8c', functions: '#88c0d0',
    variables: '#d8dee9', numbers: '#b48ead', comments: '#616e88',
    types: '#8fbcbb', operators: '#81a1c1', constants: '#81a1c1',
    invalid: '#bf616a', link: '#88c0d0',
  },
  {
    id: 'gruvbox-dark', label: 'Gruvbox Dark', dark: true,
    bg: '#282828', fg: '#ebdbb2',
    gutterBg: '#282828', gutterFg: '#928374', gutterBorder: '#3c3836',
    activeLine: '#3c3836', selection: '#3c3836', cursor: '#ebdbb2',
    keywords: '#fb4934', strings: '#b8bb26', functions: '#fabd2f',
    variables: '#ebdbb2', numbers: '#d3869b', comments: '#928374',
    types: '#fe8019', operators: '#ebdbb2', constants: '#d3869b',
    invalid: '#fb4934', link: '#fabd2f',
  },
  {
    id: 'tokyo-night', label: 'Tokyo Night', dark: true,
    bg: '#1a1b26', fg: '#c0caf5',
    gutterBg: '#1a1b26', gutterFg: '#565f89', gutterBorder: '#2b2e40',
    activeLine: '#232433', selection: '#2e3c64', cursor: '#c0caf5',
    keywords: '#bb9af7', strings: '#9ece6a', functions: '#7aa2f7',
    variables: '#c0caf5', numbers: '#ff9e64', comments: '#565f89',
    types: '#2ac3de', operators: '#89ddff', constants: '#ff9e64',
    invalid: '#f7768e', link: '#7aa2f7',
  },
  {
    id: 'solarized-light', label: 'Solarized Light', dark: false,
    bg: '#fdf6e3', fg: '#657b83',
    gutterBg: '#eee8d5', gutterFg: '#93a1a1', gutterBorder: '#e6e1cc',
    activeLine: '#eee8d5', selection: '#eee8d5', cursor: '#657b83',
    keywords: '#859900', strings: '#2aa198', functions: '#268bd2',
    variables: '#657b83', numbers: '#d33682', comments: '#93a1a1',
    types: '#b58900', operators: '#657b83', constants: '#6c71c4',
    invalid: '#dc322f', link: '#268bd2',
  },
];

const EXT_CACHE = new Map<EditorTheme, ReturnType<typeof makeTheme>>();

function makeTheme(def: ThemeDef) {
  const base = EditorView.theme({
    '&': { backgroundColor: def.bg, color: def.fg },
    '.cm-gutters': { backgroundColor: def.gutterBg, color: def.gutterFg, borderRight: `1px solid ${def.gutterBorder}` },
    '.cm-activeLineGutter': { backgroundColor: def.activeLine },
    '.cm-activeLine': { backgroundColor: def.activeLine },
    '.cm-selectionBackground': { backgroundColor: `${def.selection} !important` },
    '.cm-cursor': { borderLeftColor: def.cursor },
    '.cm-content': { caretColor: def.cursor },
  }, { dark: def.dark });

  const highlight = HighlightStyle.define([
    { tag: t.keyword, color: def.keywords },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: def.strings },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: def.functions },
    { tag: t.definition(t.function(t.variableName)), color: def.functions },
    { tag: [t.variableName, t.definition(t.variableName), t.propertyName], color: def.variables },
    { tag: [t.constant(t.variableName), t.constant(t.propertyName), t.atom], color: def.constants },
    { tag: [t.number, t.bool, t.null, t.unit], color: def.numbers },
    { tag: [t.typeName, t.className, t.namespace, t.macroName, t.definition(t.typeName)], color: def.types },
    { tag: [t.comment, t.lineComment, t.blockComment], color: def.comments, fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: def.operators },
    { tag: t.meta, color: def.fg },
    { tag: t.invalid, color: def.invalid },
    { tag: [t.heading, t.strong], color: def.types },
    { tag: t.link, color: def.link },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ]);

  return [base, syntaxHighlighting(highlight)];
}

const STORAGE_KEY = 'editor_theme_global';

export function getGlobalEditorTheme(): EditorTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return EDITOR_THEMES.some((opt) => opt.id === stored) ? (stored as EditorTheme) : 'github-dark';
}

export function setGlobalEditorTheme(theme: EditorTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function editorThemeExtensions(theme: EditorTheme) {
  if (theme === 'auto') return [];
  let cached = EXT_CACHE.get(theme);
  if (!cached) {
    const def = THEMES.find((t) => t.id === theme);
    if (!def) return [];
    cached = makeTheme(def);
    EXT_CACHE.set(theme, cached);
  }
  return cached;
}