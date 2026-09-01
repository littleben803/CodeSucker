import { useEffect, useMemo, useState, useTransition } from 'react';
import { completeFileOrder, orderedIncluded, reorderIncludedPaths, useStore, type FileRow } from '../store';
import { unlockStep } from '../wizard-progress';
import {
  aggregateStats, compositionCells, rankExtensionStats,
  scopeTotals, setExtensionIncluded, statValue, summarizeFileTypes,
  type ExtensionStat, type StatMetric, type StatScope,
} from '../file-type-stats';
import {
  buildFileTree, filterFileTree, invertAllIncluded, normalizeFileTreeSearchQuery,
  setAllIncluded, setDirectoryIncluded,
  type FileTreeDirectoryNode, type FileTreeFileNode, type SelectionState,
} from '../file-selection';

const FILE_TREE_SEARCH_DEBOUNCE_MS = 180;

const LANG_COLORS: Record<string, [string, string]> = {
  KT: ['var(--color-language-kotlin)', 'color-mix(in srgb,var(--color-language-kotlin) 14%,transparent)'],
  JAVA: ['var(--color-language-java)', 'color-mix(in srgb,var(--color-language-java) 14%,transparent)'],
  PY: ['var(--color-language-python)', 'color-mix(in srgb,var(--color-language-python) 14%,transparent)'],
  TS: ['var(--color-language-typescript)', 'color-mix(in srgb,var(--color-language-typescript) 14%,transparent)'],
  TSX: ['var(--color-language-typescript)', 'color-mix(in srgb,var(--color-language-typescript) 14%,transparent)'],
  JS: ['var(--color-language-javascript)', 'color-mix(in srgb,var(--color-language-javascript) 14%,transparent)'],
  GO: ['var(--color-language-go)', 'color-mix(in srgb,var(--color-language-go) 14%,transparent)'],
  XML: ['var(--color-language-xml)', 'color-mix(in srgb,var(--color-language-xml) 14%,transparent)'],
  HTML: ['var(--color-language-html)', 'color-mix(in srgb,var(--color-language-html) 14%,transparent)'],
  CSS: ['var(--color-language-css)', 'color-mix(in srgb,var(--color-language-css) 14%,transparent)'],
  SCSS: ['var(--color-language-scss)', 'color-mix(in srgb,var(--color-language-scss) 14%,transparent)'],
  LESS: ['var(--color-language-css)', 'color-mix(in srgb,var(--color-language-css) 14%,transparent)'],
  CPP: ['var(--color-language-typescript)', 'color-mix(in srgb,var(--color-language-typescript) 14%,transparent)'],
  C: ['var(--color-language-c)', 'color-mix(in srgb,var(--color-language-c) 14%,transparent)'],
  CS: ['var(--color-language-csharp)', 'color-mix(in srgb,var(--color-language-csharp) 14%,transparent)'],
  RS: ['var(--color-language-rust)', 'color-mix(in srgb,var(--color-language-rust) 14%,transparent)'],
  SWIFT: ['var(--color-language-swift)', 'color-mix(in srgb,var(--color-language-swift) 14%,transparent)'],
  VUE: ['var(--color-language-vue)', 'color-mix(in srgb,var(--color-language-vue) 14%,transparent)'],
};
const langStyle = (lang: string) => LANG_COLORS[lang] ?? ['var(--text2)', 'var(--panel2)'];

function SelectionCheckbox({ state, label, onChange }: {
  state: SelectionState;
  label: string;
  onChange: () => void;
}) {
  return (
    <button type="button" className={`file-tree-checkbox is-${state}`} role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'checked'} aria-label={label} onClick={onChange}>
      <span aria-hidden="true">{state === 'checked' ? '✓' : state === 'mixed' ? '−' : ''}</span>
    </button>
  );
}

function FileTreeNode({ node, depth, expandedDirectories, onToggleExpanded, onToggleDirectory, onToggleFile }: {
  node: FileTreeDirectoryNode<FileRow> | FileTreeFileNode<FileRow>;
  depth: number;
  expandedDirectories: ReadonlySet<string>;
  onToggleExpanded: (relPath: string) => void;
  onToggleDirectory: (node: FileTreeDirectoryNode<FileRow>) => void;
  onToggleFile: (relPath: string) => void;
}) {
  const paddingLeft = 6 + depth * 14;
  if (node.kind === 'file') {
    const [fg, bg] = langStyle(node.file.lang);
    return (
      <div className="file-tree-row file-tree-row--file row-hover" style={{ paddingLeft }}>
        <span className="file-tree-row__spacer" aria-hidden="true" />
        <SelectionCheckbox state={node.file.included ? 'checked' : 'unchecked'}
          label={`${node.file.included ? '取消' : '选择'}文件 ${node.relPath}`} onChange={() => onToggleFile(node.file.relPath)} />
        <span className="file-tree-row__language" style={{ color: fg, background: bg }}>{node.file.lang}</span>
        <span className="file-tree-row__name" title={node.relPath}>{node.file.name}</span>
        <span className="file-tree-row__meta">{node.file.rawLines} 行</span>
      </div>
    );
  }

  const expanded = expandedDirectories.has(node.relPath);
  return (
    <div className="file-tree-branch">
      <div className="file-tree-row file-tree-row--directory" style={{ paddingLeft }}>
        <button type="button" className={`file-tree-disclosure${expanded ? ' is-expanded' : ''}`}
          aria-label={`${expanded ? '折叠' : '展开'}目录 ${node.relPath}`} aria-expanded={expanded}
          onClick={() => onToggleExpanded(node.relPath)}>
          <span aria-hidden="true">›</span>
        </button>
        <SelectionCheckbox state={node.selectionState}
          label={`${node.selectionState === 'checked' ? '取消' : '选择'}目录 ${node.relPath}`}
          onChange={() => onToggleDirectory(node)} />
        <button type="button" className="file-tree-row__directory-name" title={node.relPath}
          onClick={() => onToggleExpanded(node.relPath)}>{node.name}</button>
        <span className="file-tree-row__meta" title={`已选择 ${node.includedFiles}，共 ${node.totalFiles} 个文件`}>
          {node.includedFiles} / {node.totalFiles}
        </span>
      </div>
      {expanded && node.children.map((child) => (
        <FileTreeNode key={child.key} node={child} depth={depth + 1}
          expandedDirectories={expandedDirectories} onToggleExpanded={onToggleExpanded}
          onToggleDirectory={onToggleDirectory} onToggleFile={onToggleFile} />
      ))}
    </div>
  );
}

export default function Step2Files() {
  const s = useStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [statScope, setStatScope] = useState<StatScope>('included');
  const [statMetric, setStatMetric] = useState<StatMetric>('rawLines');
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [fileTreeSearchInput, setFileTreeSearchInput] = useState('');
  const [fileTreeSearchQuery, setFileTreeSearchQuery] = useState('');
  const [searchExpansionOverrides, setSearchExpansionOverrides] = useState<{
    query: string;
    values: ReadonlyMap<string, boolean>;
  }>(() => ({ query: '', values: new Map() }));
  const [isFilteringFileTree, startFileTreeTransition] = useTransition();

  const byRel = useMemo(() => new Map(s.files.map((f) => [f.relPath, f])), [s.files]);
  const included = orderedIncluded(s);

  const tree = useMemo(() => buildFileTree(s.files, s.pathSeparator), [s.files, s.pathSeparator]);
  const treeSearchResult = useMemo(
    () => filterFileTree(tree, fileTreeSearchQuery, s.pathSeparator),
    [tree, fileTreeSearchQuery, s.pathSeparator],
  );
  const normalizedSearchInput = normalizeFileTreeSearchQuery(fileTreeSearchInput, s.pathSeparator);
  const isFileTreeSearchActive = fileTreeSearchQuery.length > 0;
  const isFileTreeSearchWaiting = normalizedSearchInput !== fileTreeSearchQuery;
  const visibleExpandedDirectories = useMemo(() => {
    if (!isFileTreeSearchActive) return expandedDirectories;
    const next = new Set(expandedDirectories);
    for (const relPath of treeSearchResult.expandedDirectories) next.add(relPath);
    if (searchExpansionOverrides.query === fileTreeSearchQuery) {
      for (const [relPath, expanded] of searchExpansionOverrides.values) {
        if (expanded) next.add(relPath);
        else next.delete(relPath);
      }
    }
    return next;
  }, [
    expandedDirectories,
    fileTreeSearchQuery,
    isFileTreeSearchActive,
    searchExpansionOverrides,
    treeSearchResult.expandedDirectories,
  ]);

  useEffect(() => {
    if (!normalizedSearchInput) {
      startFileTreeTransition(() => setFileTreeSearchQuery(''));
      return;
    }
    const timer = window.setTimeout(() => {
      startFileTreeTransition(() => setFileTreeSearchQuery(normalizedSearchInput));
    }, FILE_TREE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalizedSearchInput]);

  const fileTypes = useMemo(() => summarizeFileTypes(s.files), [s.files]);
  const rankedTypes = useMemo(
    () => rankExtensionStats(fileTypes.extensions, statScope, statMetric),
    [fileTypes.extensions, statScope, statMetric],
  );
  const visibleTypeLimit = 6;
  const visibleTypes = showAllTypes ? rankedTypes : rankedTypes.slice(0, visibleTypeLimit);
  const hiddenTypes = showAllTypes ? [] : rankedTypes.slice(visibleTypeLimit);
  const hiddenTotals = aggregateStats(hiddenTypes);
  const hiddenValues = scopeTotals(hiddenTotals, statScope);
  const statTotal = statScope === 'included'
    ? (statMetric === 'files' ? fileTypes.includedFiles : fileTypes.includedRawLines)
    : (statMetric === 'files' ? fileTypes.files : fileTypes.rawLines);
  const cells = compositionCells(fileTypes.extensions, statScope, statMetric);

  const totalRawLines = fileTypes.includedRawLines;
  const estimatedPages = Math.ceil(totalRawLines * 0.82 / 50); // 清洗后行数按 82% 粗估
  const materialPages = Math.min(60, estimatedPages);
  const updateFiles = (files: FileRow[]) => {
    const knownPaths = new Set(files.map((file) => file.relPath));
    const preferred = s.sortMode === 'mtime' ? s.mtimeOrder : s.entryOrder;
    const order = completeFileOrder(s.sortMode === 'manual' ? s.order : preferred, preferred, knownPaths);
    s.set({ files, order, processData: null, pdfPreviewKey: null });
  };

  const toggleFile = (rel: string) => {
    const files = s.files.map((f) => (f.relPath === rel ? { ...f, included: !f.included } : f));
    updateFiles(files);
  };

  const toggleDirectory = (node: FileTreeDirectoryNode<FileRow>) => {
    updateFiles(setDirectoryIncluded(
      s.files,
      node.relPath,
      node.selectionState !== 'checked',
      s.pathSeparator,
    ));
  };

  const toggleExpanded = (relPath: string) => {
    if (isFileTreeSearchActive) {
      setSearchExpansionOverrides((current) => {
        const values = current.query === fileTreeSearchQuery
          ? new Map(current.values)
          : new Map<string, boolean>();
        values.set(relPath, !visibleExpandedDirectories.has(relPath));
        return { query: fileTreeSearchQuery, values };
      });
      return;
    }
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  };

  const clearFileTreeSearch = () => {
    setFileTreeSearchInput('');
    setSearchExpansionOverrides({ query: '', values: new Map() });
    startFileTreeTransition(() => setFileTreeSearchQuery(''));
  };

  const setEveryFile = (includedState: boolean) => updateFiles(setAllIncluded(s.files, includedState));
  const invertEveryFile = () => updateFiles(invertAllIncluded(s.files));

  const toggleExtension = (stat: ExtensionStat) => {
    updateFiles(setExtensionIncluded(s.files, stat.extension, !stat.fullyIncluded));
  };

  const setSortMode = (mode: 'entry' | 'mtime' | 'manual') => {
    if (mode === 'manual') { s.set({ sortMode: mode }); return; }
    const base = mode === 'entry' ? s.entryOrder : s.mtimeOrder;
    s.set({ sortMode: mode, order: base.filter((r) => byRel.has(r)), processData: null, pdfPreviewKey: null });
  };

  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const arr = included.map((f) => f.relPath);
    const [it] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, it);
    setDragIdx(i);
    s.set({ order: reorderIncludedPaths(s.order, arr), sortMode: 'manual', processData: null, pdfPreviewKey: null });
  };

  const ring = 2 * Math.PI * 26;
  const pageOk = estimatedPages >= 60;

  return (
    <div className="step2-files">
      <section className="step2-surface-card step2-main-card" aria-label="文件选择与排序">
        {/* 文件树 */}
        <aside className="file-tree-panel">
          <div className="file-tree-toolbar">
            <div className="file-tree-toolbar__heading">
              <strong>项目文件</strong>
              <span title={`已选择 ${included.length}，共 ${s.files.length} 个文件`}>{included.length} / {s.files.length}</span>
            </div>
            <div className="file-tree-toolbar__actions" aria-label="全局文件选择">
              <button type="button" onClick={() => setEveryFile(true)}>全选</button>
              <button type="button" onClick={() => setEveryFile(false)}>清空</button>
              <button type="button" onClick={invertEveryFile} title="反选当前项目的全部扫描文件">反选</button>
            </div>
            <div className="file-tree-search">
              <span className="file-tree-search__icon" aria-hidden="true">⌕</span>
              <input type="search" value={fileTreeSearchInput} placeholder="搜索目录、文件或相对路径"
                aria-label="搜索项目文件" autoComplete="off" spellCheck={false}
                onChange={(event) => setFileTreeSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || !fileTreeSearchInput) return;
                  event.preventDefault();
                  clearFileTreeSearch();
                }} />
              {fileTreeSearchInput && (
                <button type="button" aria-label="清空项目文件搜索" title="清空搜索（Esc）"
                  onClick={clearFileTreeSearch}>×</button>
              )}
            </div>
            <div className="file-tree-search__status" role="status" aria-live="polite">
              {isFileTreeSearchWaiting || isFilteringFileTree
                ? '正在筛选…'
                : isFileTreeSearchActive
                  ? `匹配 ${treeSearchResult.matchedNodes} 项 · 显示 ${treeSearchResult.visibleFiles} 个文件`
                  : '支持目录、文件名和相对路径'}
            </div>
          </div>
          <div className="file-tree-scroll" aria-label="项目文件树">
            {isFileTreeSearchActive && treeSearchResult.tree.children.length === 0 ? (
              <div className="file-tree-empty">
                <strong>无匹配结果</strong>
                <span>换个关键词，或按 Esc 清空搜索</span>
              </div>
            ) : treeSearchResult.tree.children.map((node) => (
              <FileTreeNode key={node.key} node={node} depth={0}
                expandedDirectories={visibleExpandedDirectories} onToggleExpanded={toggleExpanded}
                onToggleDirectory={toggleDirectory} onToggleFile={toggleFile} />
            ))}
          </div>
        </aside>

        {/* 有序列表 */}
        <div className="step2-order-panel">
          <div className="step2-order-header">
            <div className="step2-order-header__title" title="已选择文件顺序 · 可拖拽调整">
              已选择文件顺序 <span>· 可拖拽调整</span>
            </div>
            <div className="step2-segmented" aria-label="文件排序方式">
              {([['entry', '入口优先', '入口优先（推荐）'], ['mtime', '修改时间', '按修改时间排序'], ['manual', '手动', '手动排序']] as const).map(([id, label, title]) => {
                const on = s.sortMode === id;
                return (
                  <button key={id} onClick={() => setSortMode(id)} title={title} className={on ? 'is-active' : undefined}>{label}</button>
                );
              })}
            </div>
          </div>
          <div className="step2-order-list">
            {included.map((f, i) => (
              <div key={f.relPath} draggable className="step2-order-row"
                onDragStart={() => setDragIdx(i)} onDragOver={onDragOver(i)} onDragEnd={() => setDragIdx(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--list-row-bg)', border: `1px solid ${dragIdx === i ? 'var(--accent)' : 'var(--list-row-border)'}`, borderRadius: 9, cursor: 'grab', boxShadow: 'var(--list-row-shadow)', opacity: dragIdx === i ? 0.55 : 1 }}>
                <svg width="10" height="14" viewBox="0 0 10 14" style={{ flex: 'none', color: 'var(--text3)' }}>{[3, 7, 11].map((y) => [3, 7].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />))}</svg>
                <span style={{ width: 20, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                {i === 0 && <span className="step2-order-row__badge" style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', padding: '1px 7px', borderRadius: 5, fontWeight: 500 }}>📌 首页起点</span>}
                {i === included.length - 1 && <span className="step2-order-row__badge" style={{ fontSize: 11, color: 'var(--green)', background: 'var(--green-soft)', padding: '1px 7px', borderRadius: 5, fontWeight: 500 }}>🏁 末页终点</span>}
                <span className="step2-order-row__lines" style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{f.rawLines} 行</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 统计 */}
      <aside className="step2-surface-card step2-stats-panel">
        <div className="step2-stats-panel__title">统计</div>
        {s.scanErrors.length > 0 && (
          <div className="step2-scan-error" style={{ background: 'var(--orange-soft)', border: '1px solid color-mix(in srgb, var(--orange) 35%, transparent)', borderRadius: 9, padding: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--orange)' }}>{s.scanErrors.length} 个文件扫描失败，已跳过</div>
            <div className="step2-scan-error__detail" title={`${s.scanErrors[0].file} · ${s.scanErrors[0].message}`} style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              {s.scanErrors[0].file} · {s.scanErrors[0].message}
            </div>
          </div>
        )}
        <div className="step2-stat-grid">
          <StatCard label="总文件" value={String(s.files.length)} unit="个" />
          <StatCard label="已选择" value={String(included.length)} unit="个" accent />
        </div>
        <StatCard label="已选择原始行数" value={totalRawLines.toLocaleString()} unit="行" wide />
        <div className="step2-page-estimate">
          <svg width="62" height="62" viewBox="0 0 62 62">
            <circle cx="31" cy="31" r="26" fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle cx="31" cy="31" r="26" fill="none" stroke={pageOk ? 'var(--green)' : 'var(--orange)'} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${ring * Math.min(1, materialPages / 60)} ${ring}`} transform="rotate(-90 31 31)" />
            <text x="31" y="29" textAnchor="middle" fontSize={estimatedPages >= 1000 ? 10 : estimatedPages >= 100 ? 12 : 14}
              fontWeight="600" fill="var(--text)" fontFamily="var(--mono)">{estimatedPages}</text>
            <text x="31" y="42" textAnchor="middle" fontSize="11" fill="var(--text3)">页</text>
          </svg>
          <div className="step2-page-estimate__copy">
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>预估 {estimatedPages} 页</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: pageOk ? 'var(--green)' : 'var(--orange)', marginTop: 2 }}>
              {pageOk ? '满足材料 60 页要求 ✓' : `不足 60 页，将全量提交`}
            </div>
          </div>
        </div>
        <div className="step2-type-card">
          <div className="step2-type-card__heading">
            <div className="step2-type-card__heading-copy">
              <div style={{ fontSize: 11.5, fontWeight: 600 }}>文件类型统计</div>
            </div>
            <div className="step2-scope-switch" aria-label="文件类型统计范围">
              {([['all', '全部'], ['included', '已选择']] as const).map(([value, label]) => (
                <button key={value} onClick={() => setStatScope(value)}
                  className={statScope === value ? 'is-active' : undefined}>{label}</button>
              ))}
            </div>
          </div>

          <div className="step2-type-toolbar">
            <div className="step2-metric-switch">
              {([['rawLines', '代码行'], ['files', '文件数']] as const).map(([value, label]) => (
                <button key={value} onClick={() => setStatMetric(value)}
                  className={statMetric === value ? 'is-active' : undefined}>{label}</button>
              ))}
            </div>
            <span className="step2-type-toolbar__total" title={`${statTotal.toLocaleString()}${statMetric === 'rawLines' ? ' 行' : ' 个'}`}>
              {statTotal.toLocaleString()}{statMetric === 'rawLines' ? ' 行' : ' 个'}
            </span>
          </div>

          <div aria-label="文件类型占比" style={{ display: 'flex', gap: 2, padding: 3, height: 24, marginTop: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel)' }}>
            {cells.length === 0
              ? <div style={{ flex: 1, borderRadius: 3, background: 'var(--border2)' }} />
              : cells.map((key, index) => {
                  const stat = fileTypes.extensions.find((item) => item.key === key);
                  const [color] = langStyle(stat?.language ?? 'OTHER');
                  return <span key={`${key}-${index}`} title={stat?.label} style={{ flex: 1, minWidth: 2, borderRadius: 2, background: color }} />;
                })}
          </div>

          <div className="step2-type-list">
            {visibleTypes.map((stat) => {
              const [color, soft] = langStyle(stat.language);
              const values = scopeTotals(stat, statScope);
              const percentage = statTotal > 0 ? statValue(stat, statScope, statMetric) / statTotal : 0;
              return (
                <div key={stat.key} className="file-type-row">
                  <button onClick={() => toggleExtension(stat)} aria-label={`${stat.fullyIncluded ? '取消' : '选择'} ${stat.label}`} aria-pressed={stat.fullyIncluded}
                    style={{ width: 15, height: 15, flex: 'none', padding: 0, border: `1.5px solid ${color}`, borderRadius: 4, background: stat.includedFiles > 0 ? color : 'var(--panel)', color: 'var(--color-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {stat.fullyIncluded ? '✓' : stat.partiallyIncluded ? '−' : ''}
                  </button>
                  <button onClick={() => toggleExtension(stat)} className="file-type-row__main" title={`${stat.label} · ${values.files} 个文件 · ${values.rawLines.toLocaleString()} 行`}>
                    <span className="file-type-row__identity">
                      <span className="file-type-row__label">{stat.label}</span>
                      <span className="file-type-row__language" style={{ color, background: soft }}>{stat.language}</span>
                    </span>
                    <span className="file-type-row__details">
                      {values.files} 个文件 · {values.rawLines.toLocaleString()} 行
                    </span>
                  </button>
                  <div className="file-type-row__aside">
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color }}>{(percentage * 100).toFixed(percentage > 0 && percentage < 0.01 ? 1 : 0)}%</div>
                  </div>
                </div>
              );
            })}
            {hiddenTypes.length > 0 && (
              <button onClick={() => setShowAllTypes(true)} className="step2-type-list__more"
                title={`其余 ${hiddenTypes.length} 类 · ${hiddenValues.files} 文件 · ${hiddenValues.rawLines.toLocaleString()} 行`}>
                <span>其余 {hiddenTypes.length} 类 · {hiddenValues.files} 文件 · {hiddenValues.rawLines.toLocaleString()} 行</span>
                <strong>展开</strong>
              </button>
            )}
            {showAllTypes && rankedTypes.length > visibleTypeLimit && (
              <button onClick={() => setShowAllTypes(false)} className="step2-type-list__collapse">收起到 Top {visibleTypeLimit}</button>
            )}
          </div>

        </div>
        <div className="step2-stats-footer">
          <button className="btn-primary" disabled={included.length === 0}
            onClick={() => s.set({ step: 3, maxUnlockedStep: unlockStep(s.maxUnlockedStep, 3) })}>下一步：清洗与排版</button>
          {included.length === 0 && <div className="step2-stats-footer__hint">至少选择一个文件</div>}
        </div>
      </aside>
    </div>
  );
}

function StatCard({ label, value, unit, accent, wide }: { label: string; value: string; unit: string; accent?: boolean; wide?: boolean }) {
  const valueColor = accent ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="step2-stat-card" style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</div>
      <div title={`${value} ${unit}`} style={{ fontSize: 19, fontWeight: 600, fontFamily: 'var(--mono)', marginTop: 2, color: valueColor, whiteSpace: 'nowrap' }}>
        {value}{' '}<span style={{ fontSize: 11.5, fontWeight: 500, fontFamily: 'var(--sans)', color: valueColor }}>{unit}</span>
      </div>
    </div>
  );
}
