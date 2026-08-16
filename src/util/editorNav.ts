import type { Parser, SyntaxNode, Tree } from '@lezer/common';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

export type NavLang = 'python' | 'javascript' | 'typescript' | 'java' | 'csharp';

export interface NavToken {
  name: string;
  from: number;
  to: number;
}

export interface ImportInfo {
  kind: 'import';
  lang: NavLang;
  module: string;
  importedName: string | null;
  isRelative: boolean;
}

export interface ResolvedTarget {
  file: string;
  line?: number;
}

const NAV_LANGS: NavLang[] = ['python', 'javascript', 'typescript', 'java', 'csharp'];

export function isNavLanguage(lang: string): lang is NavLang {
  return (NAV_LANGS as string[]).includes(lang);
}

const NAME_NODES: Record<NavLang, Set<string>> = {
  python: new Set(['VariableName', 'PropertyName']),
  javascript: new Set(['VariableName', 'VariableDefinition', 'PropertyName', 'TypeName', 'JSXIdentifier']),
  typescript: new Set(['VariableName', 'VariableDefinition', 'PropertyName', 'TypeName', 'JSXIdentifier']),
  java: new Set(['Identifier', 'MethodName', 'Definition']),
  csharp: new Set(['TypeIdentifier', 'Ident', 'MethodName', 'VarName']),
};

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function dirname(p: string): string {
  const s = norm(p);
  const i = s.lastIndexOf('/');
  return i < 0 ? '' : s.slice(0, i);
}

function join(a: string, b: string): string {
  return norm(a).replace(/\/+$/, '') + '/' + b;
}

function lineNumber(src: string, from: number): number {
  return src.slice(0, from).split('\n').length - 1;
}

function tokenFrom(node: SyntaxNode | null, names: Set<string>, getText: (f: number, t: number) => string): NavToken | null {
  let n: SyntaxNode | null = node;
  while (n && n.from === n.to) n = n.parent;
  while (n) {
    if (names.has(n.name) && n.to > n.from) {
      const text = getText(n.from, n.to);
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
        return { name: text, from: n.from, to: n.to };
      }
    }
    n = n.parent;
  }
  return null;
}

export function tokenAt(view: EditorView, pos: number, lang: string): NavToken | null {
  if (!isNavLanguage(lang)) return null;
  const names = NAME_NODES[lang];
  const getText = (f: number, t: number) => view.state.sliceDoc(f, t);
  const tree = syntaxTree(view.state);
  const side1 = tokenFrom(tree.resolveInner(pos, 1), names, getText);
  if (side1 && pos >= side1.from && pos < side1.to) return side1;
  const sideNeg = tokenFrom(tree.resolveInner(pos, -1), names, getText);
  if (sideNeg && pos >= sideNeg.from && pos < sideNeg.to) return sideNeg;
  return side1 ?? sideNeg;
}

function isDeclNameNode(lang: string, node: SyntaxNode, getText: (f: number, t: number) => string): boolean {
  const p = node.parent;
  if (!p) return false;
  switch (lang) {
    case 'python':
      return node.name === 'VariableName' && (p.name === 'ClassDefinition' || p.name === 'FunctionDefinition');
    case 'javascript':
    case 'typescript':
      return (node.name === 'VariableDefinition' && (
        p.name === 'ClassDeclaration' || p.name === 'FunctionDeclaration' || p.name === 'VariableDeclaration'
      )) || (node.name === 'TypeDefinition' && (
        p.name === 'InterfaceDeclaration' || p.name === 'TypeAliasDeclaration' || p.name === 'EnumDeclaration'
      )) || (node.name === 'PropertyDefinition' && p.name === 'MethodDeclaration');
    case 'java':
      return node.name === 'Definition' && (
        p.name === 'ClassDeclaration' || p.name === 'InterfaceDeclaration' || p.name === 'EnumDeclaration' ||
        p.name === 'MethodDeclaration' || p.name === 'ConstructorDeclaration' || p.name === 'AnnotationTypeDeclaration'
      );
    case 'csharp':
      if (node.name === 'MethodName') {
        const next = node.nextSibling;
        if (!(next && next.name === 'Delim' && getText(next.from, next.to).startsWith('('))) return false;
        const after = next.nextSibling;
        return !!after && after.name === 'Delim' && getText(after.from, after.to).startsWith('{');
      }
      if (node.name === 'TypeIdentifier') {
        const prev = node.prevSibling;
        return !!prev && prev.name === 'Keyword' && /^(class|struct|interface|record|enum)$/.test(getText(prev.from, prev.to));
      }
      return false;
  }
  return false;
}

function findDefinitionNode(
  tree: Tree,
  name: string,
  before: number,
  getText: (f: number, t: number) => string,
  lang: string,
): SyntaxNode | null {
  let bestBefore: SyntaxNode | null = null;
  let bestAfter: SyntaxNode | null = null;
  tree.iterate({
    enter: (ref) => {
      if (!isDeclNameNode(lang, ref.node, getText)) return;
      if (getText(ref.from, ref.to) !== name) return;
      if (ref.from < before) {
        if (!bestBefore || ref.from > bestBefore.from) bestBefore = ref.node;
      } else if (!bestAfter || ref.from < bestAfter.from) {
        bestAfter = ref.node;
      }
    },
  });
  return bestBefore || bestAfter;
}

export function findDefinitionLine(view: EditorView, name: string, before: number, lang: string): number | null {
  const getText = (f: number, t: number) => view.state.sliceDoc(f, t);
  const full = ensureSyntaxTree(view.state, view.state.doc.length, 100);
  const tree = full ?? syntaxTree(view.state);
  const node = findDefinitionNode(tree, name, before, getText, lang);
  return node ? view.state.doc.lineAt(node.from).number - 1 : null;
}

export async function findSymbolLine(path: string, name: string, parser: Parser, lang: NavLang): Promise<number | null> {
  const src = await readTextFile(path);
  const tree = parser.parse(src);
  const getText = (f: number, t: number) => src.slice(f, t);
  const node = findDefinitionNode(tree, name, Number.MAX_SAFE_INTEGER, getText, lang);
  return node ? lineNumber(src, node.from) : null;
}

export function memberReceiverName(view: EditorView, token: NavToken, lang: string): string | null {
  if (lang !== 'csharp') return null;
  const idNames = new Set(['Ident', 'TypeIdentifier', 'VarName', 'MethodName']);
  const getText = (f: number, t: number) => view.state.sliceDoc(f, t);
  const tree = syntaxTree(view.state);
  let cur: SyntaxNode | null = tree.resolveInner(token.from, 1);
  while (cur && !(cur.from <= token.from && cur.to >= token.to && idNames.has(cur.name))) cur = cur.parent;
  if (!cur) return null;
  const prev = cur.prevSibling;
  if (!prev || prev.name !== '.' || getText(prev.from, prev.to) !== '.') return null;
  const recv = prev.prevSibling;
  if (!recv || !idNames.has(recv.name)) return null;
  const text = getText(recv.from, recv.to);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : null;
}

export async function findMethodTarget(
  projectPath: string,
  receiverName: string,
  methodName: string,
  parser: Parser,
  lang: NavLang,
): Promise<ResolvedTarget | null> {
  const index = await getProjectFileIndex(projectPath);
  const bases = new Set<string>([receiverName, receiverName.replace(/^I(?=[A-Z])/, '')]);
  if (!receiverName.startsWith('I')) bases.add('I' + receiverName);
  const tried = new Set<string>();
  for (const base of bases) {
    for (const file of index.byBase.get(base.toLowerCase()) ?? []) {
      if (tried.has(file)) continue;
      tried.add(file);
      const line = await findSymbolLine(file, methodName, parser, lang);
      if (line != null) return { file, line };
    }
  }
  return null;
}

function climbTo(tree: Tree, from: number, wanted: string): SyntaxNode | null {
  let node: SyntaxNode | null = tree.resolveInner(from, 1);
  while (node && node.name !== wanted) node = node.parent;
  return node;
}

function pythonImportInfo(view: EditorView, token: NavToken): ImportInfo | null {
  const tree = syntaxTree(view.state);
  const imp = climbTo(tree, token.from, 'ImportStatement');
  if (!imp) return null;

  const getText = (f: number, t: number) => view.state.sliceDoc(f, t);
  const parts: { text: string; isName: boolean; from: number; to: number }[] = [];
  let c = imp.firstChild;
  while (c) {
    parts.push({ text: getText(c.from, c.to), isName: c.name === 'VariableName', from: c.from, to: c.to });
    c = c.nextSibling;
  }
  const kw = (t: string) => parts.findIndex((p) => !p.isName && p.text === t);
  const fromIdx = kw('from');
  const importIdx = kw('import');
  const tokenIdx = parts.findIndex((p) => token.from >= p.from && token.from <= p.to);
  const clicked = parts[tokenIdx];

  if (fromIdx >= 0 && importIdx > fromIdx) {
    const module = parts.slice(fromIdx + 1, importIdx).filter((p) => p.isName).map((p) => p.text).join('.');
    const importedNames = parts.slice(importIdx + 1).filter((p) => p.isName).map((p) => p.text);
    if (clicked && !clicked.isName) return null;
    const clickedName = clicked ? clicked.text : null;
    const imported = importedNames.includes(clickedName || '') ? clickedName : null;
    return { kind: 'import', lang: 'python', module, importedName: imported, isRelative: false };
  }

  if (importIdx >= 0) {
    const asIdx = parts.slice(importIdx + 1).findIndex((p) => !p.isName && p.text === 'as');
    const endIdx = asIdx >= 0 ? importIdx + 1 + asIdx : parts.length;
    const module = parts.slice(importIdx + 1, endIdx).filter((p) => p.isName).map((p) => p.text).join('.');
    return { kind: 'import', lang: 'python', module, importedName: null, isRelative: false };
  }

  return null;
}

function jsImportInfo(view: EditorView, token: NavToken, lang: NavLang): ImportInfo | null {
  const tree = syntaxTree(view.state);
  const imp = climbTo(tree, token.from, 'ImportDeclaration');
  if (!imp) return null;
  const pathNode = imp.getChild('String');
  if (!pathNode) return null;
  const raw = view.state.sliceDoc(pathNode.from + 1, pathNode.to - 1);
  const isRelative = raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/');
  return {
    kind: 'import',
    lang,
    module: raw,
    importedName: token.name,
    isRelative,
  };
}

function javaImportInfo(view: EditorView, token: NavToken): ImportInfo | null {
  const tree = syntaxTree(view.state);
  const imp = climbTo(tree, token.from, 'ImportDeclaration');
  if (!imp) return null;
  const fqn = imp.getChild('ScopedIdentifier');
  if (!fqn) return null;
  const module = view.state.sliceDoc(fqn.from, fqn.to);
  const last = module.split('.').pop() || module;
  return { kind: 'import', lang: 'java', module, importedName: last, isRelative: false };
}

function csharpImportInfo(view: EditorView, token: NavToken): ImportInfo | null {
  const tree = syntaxTree(view.state);
  const getText = (f: number, t: number) => view.state.sliceDoc(f, t);
  const tokenNode = tree.resolveInner(token.from, 1);
  let node: SyntaxNode | null = tokenNode;
  while (node && node.name !== 'TypeIdentifier') node = node.parent;
  if (!node) return null;
  let k: SyntaxNode | null = node.prevSibling;
  while (k && (k.name === 'TypeIdentifier' || k.name === '.')) k = k.prevSibling;
  if (!k || k.name !== 'Keyword' || getText(k.from, k.to) !== 'using') return null;
  const segs: string[] = [getText(node.from, node.to)];
  let c = node.nextSibling;
  while (c && c.name !== ';') {
    if (c.name === 'TypeIdentifier') segs.push(getText(c.from, c.to));
    c = c.nextSibling;
  }
  const module = segs.join('.');
  return { kind: 'import', lang: 'csharp', module, importedName: segs[segs.length - 1], isRelative: false };
}

export function getImportInfo(view: EditorView, token: NavToken, lang: string): ImportInfo | null {
  if (!isNavLanguage(lang)) return null;
  switch (lang) {
    case 'python': return pythonImportInfo(view, token);
    case 'javascript':
    case 'typescript': return jsImportInfo(view, token, lang);
    case 'java': return javaImportInfo(view, token);
    case 'csharp': return csharpImportInfo(view, token);
  }
}

interface FileIndex {
  byBase: Map<string, string[]>;
  byPath: Set<string>;
}

const indexCache = new Map<string, FileIndex>();
const indexInflight = new Map<string, Promise<FileIndex>>();

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readDir(dir);
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory) {
      files.push(...await walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function buildIndex(projectPath: string): Promise<FileIndex> {
  const all = await walkFiles(projectPath);
  const byBase = new Map<string, string[]>();
  const byPath = new Set<string>();
  for (const f of all) {
    const lower = norm(f).toLowerCase();
    byPath.add(lower);
    const base = lower.split('/').pop() || '';
    const stem = base.replace(/\.[^.]+$/, '');
    const arr = byBase.get(stem) || [];
    arr.push(f);
    byBase.set(stem, arr);
  }
  return { byBase, byPath };
}

export function getProjectFileIndex(projectPath: string): Promise<FileIndex> {
  const cached = indexCache.get(projectPath);
  if (cached) return Promise.resolve(cached);
  let p = indexInflight.get(projectPath);
  if (!p) {
    p = buildIndex(projectPath).then((idx) => {
      indexCache.set(projectPath, idx);
      indexInflight.delete(projectPath);
      return idx;
    });
    indexInflight.set(projectPath, p);
  }
  return p;
}

export function hasCachedFile(projectPath: string, stem: string, exts: string[]): boolean {
  const idx = indexCache.get(projectPath);
  if (!idx) return false;
  const arr = idx.byBase.get(stem.toLowerCase());
  if (!arr) return false;
  const extSet = new Set(exts.map((e) => e.toLowerCase()));
  return arr.some((f) => extSet.has(norm(f).split('.').pop() || ''));
}

async function findFileByBase(projectPath: string, stem: string, exts: string[]): Promise<string | null> {
  const index = await getProjectFileIndex(projectPath);
  const arr = index.byBase.get(stem.toLowerCase());
  if (!arr) return null;
  const extSet = new Set(exts.map((e) => e.toLowerCase()));
  return arr.find((f) => extSet.has(norm(f).split('.').pop() || '')) || arr[0] || null;
}

async function resolvePythonImport(projectPath: string, info: ImportInfo, parser: Parser): Promise<ResolvedTarget | null> {
  const parts = info.module.split('.');
  const base = parts.join('/');
  const index = await getProjectFileIndex(projectPath);
  const exists = (rel: string) => index.byPath.has(norm(rel).toLowerCase());

  if (info.importedName) {
    const moduleFile = `${base}.py`;
    const initFile = `${base}/__init__.py`;
    const sub = `${base}/${info.importedName}.py`;
    if (exists(join(projectPath, sub))) return { file: join(projectPath, sub) };
    for (const rel of [moduleFile, initFile]) {
      const p = join(projectPath, rel);
      if (exists(p)) {
        const line = await findSymbolLine(p, info.importedName, parser, 'python');
        return line == null ? { file: p } : { file: p, line };
      }
    }
    return null;
  }

  for (const rel of [`${base}.py`, `${base}/__init__.py`]) {
    const p = join(projectPath, rel);
    if (exists(p)) return { file: p };
  }
  return null;
}

async function resolveJsImport(projectPath: string, filePath: string, info: ImportInfo, parser: Parser): Promise<ResolvedTarget | null> {
  if (!info.isRelative) return null;
  const dir = join(dirname(filePath), info.module);
  const candidates: string[] = [];
  const add = (p: string) => { if (!candidates.includes(p)) candidates.push(p); };
  add(dir);
  for (const e of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) add(dir + e);
  add(join(dir, 'index.ts'));
  add(join(dir, 'index.tsx'));
  add(join(dir, 'index.js'));
  add(join(dir, 'index.jsx'));

  const index = await getProjectFileIndex(projectPath);
  const found = candidates.find((c) => index.byPath.has(norm(c).toLowerCase()));
  if (!found) return null;
  if (!info.importedName) return { file: found };
  const lang: NavLang = info.lang;
  const line = await findSymbolLine(found, info.importedName, parser, lang);
  return line == null ? { file: found } : { file: found, line };
}

async function resolveJavaOrCs(projectPath: string, info: ImportInfo): Promise<ResolvedTarget | null> {
  if (!info.importedName) return null;
  const exts = info.lang === 'java' ? ['java'] : ['cs'];
  const f = await findFileByBase(projectPath, info.importedName, exts);
  return f ? { file: f } : null;
}

export async function resolveImport(opts: {
  projectPath: string;
  filePath: string;
  info: ImportInfo;
  parser: Parser;
}): Promise<ResolvedTarget | null> {
  const { projectPath, filePath, info, parser } = opts;
  switch (info.lang) {
    case 'python': return resolvePythonImport(projectPath, info, parser);
    case 'javascript':
    case 'typescript': return resolveJsImport(projectPath, filePath, info, parser);
    case 'java':
    case 'csharp': return resolveJavaOrCs(projectPath, info);
  }
}

export async function findFileByTypeName(projectPath: string, name: string, lang: NavLang): Promise<ResolvedTarget | null> {
  const exts = lang === 'java' ? ['java'] : ['cs'];
  const f = await findFileByBase(projectPath, name, exts);
  return f ? { file: f } : null;
}

export function clearFileIndexCache(projectPath?: string): void {
  if (projectPath) {
    indexCache.delete(projectPath);
    indexInflight.delete(projectPath);
  } else {
    indexCache.clear();
    indexInflight.clear();
  }
}