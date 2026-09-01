import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  canResetScanExcludeRules, getScanExcludeRuleErrors, normalizeScanExcludeRule, normalizeScanExcludeRules,
  sameScanExcludeRules, validateScanExcludeRule,
} from '../scan-exclude-rules';
import { getBuiltInScanExcludeRuleHelp } from '../scan-exclude-rule-help';
import { toast } from '../store';
import type { UpdateState } from '../../../shared/update';
import '../software-update.css';

interface SettingsCardHeaderProps {
  icon: ReactNode;
  title: string;
  titleId?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  actionInline?: boolean;
}

function SettingsCardHeader({ icon, title, titleId, subtitle, action, actionInline = false }: SettingsCardHeaderProps) {
  return (
    <div className="settings-card__header">
      <div className="settings-card__header-main">
        <span className="settings-card__header-icon" aria-hidden="true">{icon}</span>
        <h2 id={titleId} className="settings-card__header-title">{title}</h2>
        {action && <div className={`settings-card__header-action${actionInline ? ' settings-card__header-action--inline' : ''}`}>{action}</div>}
      </div>
      {subtitle && <div className="settings-card__header-subtitle">{subtitle}</div>}
    </div>
  );
}

function UpdateIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M13.3 5.9A5.5 5.5 0 1 0 13 10.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M10.8 3.6h2.7v2.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PrivacyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8 7.1v3.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="8" cy="4.8" r=".75" fill="currentColor" />
    </svg>
  );
}

function ScanExcludeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8 13 3.7v3.7c0 3.1-1.9 5.7-5 6.8-3.1-1.1-5-3.7-5-6.8V3.7L8 1.8Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="m5.7 7.9 1.5 1.5 3.2-3.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BuiltInRuleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m2.4 5 5.6-3 5.6 3v6L8 14l-5.6-3V5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="m2.7 5 5.3 3 5.3-3M8 8v6M5.3 3.5l5.4 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CustomRuleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3 11.8-.4 2 2-.4 7.7-7.7-1.6-1.6L3 11.8Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.8 5 1.6 1.6M10.7 4.1l.8-.8a1.1 1.1 0 0 1 1.6 0l.4.4a1.1 1.1 0 0 1 0 1.6l-.8.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteRuleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 4.7h9.6M6.1 4.7V3.3h3.8v1.4M4.4 4.7l.6 8h6l.6-8M6.7 7v3.4M9.3 7v3.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / (1024 ** index);
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function updateActionLabel(state: UpdateState | null): string {
  if (!state) return '正在读取…';
  if (state.phase === 'checking') return '正在检查…';
  if (state.phase === 'downloading') return '正在下载…';
  if (state.phase === 'downloaded') return '重启并安装';
  if (state.phase === 'available' || (state.phase === 'error' && state.errorCode === 'download-failed' && state.targetVersion)) {
    return '下载更新';
  }
  return '检查更新';
}

function updateStatusTitle(state: UpdateState | null): string {
  if (!state) return '正在读取更新状态';
  if (!state.supported) return '开发版不检查更新';
  if (state.phase === 'up-to-date') return '当前已是最新版本';
  if (state.phase === 'available') return `发现新版本 v${state.targetVersion}`;
  if (state.phase === 'downloading') return `正在下载 v${state.targetVersion ?? ''}`.trim();
  if (state.phase === 'downloaded') return `v${state.targetVersion} 已准备好安装`;
  if (state.phase === 'installing') return '正在重启并安装';
  if (state.phase === 'error') return '更新操作未完成';
  return '软件更新';
}

export default function Settings() {
  const [rules, setRules] = useState<string[]>([]);
  const [savedRules, setSavedRules] = useState<string[]>([]);
  const [ruleSource, setRuleSource] = useState<'default' | 'user'>('default');
  const [ruleWarning, setRuleWarning] = useState<string | null>(null);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleLoadError, setRuleLoadError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);
  const [focusedRuleIndex, setFocusedRuleIndex] = useState<number | null>(null);
  const [ruleHelpOpen, setRuleHelpOpen] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [updateActionPending, setUpdateActionPending] = useState(false);
  const ruleHelpButtonRef = useRef<HTMLButtonElement>(null);
  const ruleHelpDialogRef = useRef<HTMLDivElement>(null);
  const ruleErrors = useMemo(() => getScanExcludeRuleErrors(rules), [rules]);
  const rulesInvalid = ruleErrors.some(Boolean);
  const rulesDirty = !sameScanExcludeRules(normalizeScanExcludeRules(rules), savedRules);

  const applyRuleResult = (result: { rules: string[]; source: 'default' | 'user'; warning: string | null }) => {
    setRules(result.rules);
    setSavedRules(result.rules);
    setRuleSource(result.source);
    setRuleWarning(result.warning);
    setRuleLoadError(null);
  };

  const loadRules = async () => {
    setRuleLoading(true);
    setRuleLoadError(null);
    try {
      applyRuleResult(await window.codedoc.getScanExcludes());
    } catch (error) {
      setRuleLoadError(error instanceof Error ? error.message : '无法读取排除规则');
    } finally {
      setRuleLoading(false);
    }
  };

  useEffect(() => { void loadRules(); }, []);

  useEffect(() => {
    let active = true;
    void window.codedoc.getUpdateState()
      .then((state) => { if (active) setUpdateState(state); })
      .catch(() => { if (active) setUpdateState(null); });
    const unsubscribe = window.codedoc.onUpdateState((state) => {
      if (active) setUpdateState(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ruleHelpOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRuleHelpOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    ruleHelpDialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      ruleHelpButtonRef.current?.focus();
    };
  }, [ruleHelpOpen]);

  const handleAddRule = (event: FormEvent) => {
    event.preventDefault();
    const result = validateScanExcludeRule(newRule);
    if (result.error) {
      setNewRuleError(result.error);
      return;
    }
    if (rules.some((rule) => normalizeScanExcludeRule(rule) === result.normalized)) {
      setNewRuleError('规则已存在，无需重复添加');
      return;
    }
    setRules((current) => [...current, result.normalized]);
    setNewRule('');
    setNewRuleError(null);
  };

  const handleSaveRules = async () => {
    if (rulesInvalid || !rulesDirty || ruleSaving) return;
    setRuleSaving(true);
    try {
      applyRuleResult(await window.codedoc.saveScanExcludes(normalizeScanExcludeRules(rules)));
      toast('排除规则已保存，将从下次扫描开始生效');
    } catch (error) {
      toast(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuleSaving(false);
    }
  };

  const handleResetRules = async () => {
    if (ruleSaving) return;
    setRuleSaving(true);
    try {
      applyRuleResult(await window.codedoc.resetScanExcludes());
      setNewRule('');
      setNewRuleError(null);
      toast('已恢复内置默认规则，将从下次扫描开始生效');
    } catch (error) {
      toast(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuleSaving(false);
    }
  };

  const handleUpdateAction = async () => {
    if (!updateState?.supported || updateActionPending) return;
    if (updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing') return;
    setUpdateActionPending(true);
    try {
      let nextState: UpdateState;
      if (updateState.phase === 'downloaded') {
        nextState = await window.codedoc.installUpdate();
      } else if (updateState.phase === 'available'
        || (updateState.phase === 'error' && updateState.errorCode === 'download-failed' && updateState.targetVersion)) {
        nextState = await window.codedoc.downloadUpdate();
      } else {
        nextState = await window.codedoc.checkForUpdates();
      }
      setUpdateState(nextState);
      if (nextState.errorCode === 'pipeline-busy') toast(nextState.message);
    } catch (error) {
      toast(`更新操作失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUpdateActionPending(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <div className="settings-content">
          <div className="settings-grid">
            <div className="settings-stack">
              <section className="settings-card settings-card--scan-rules" aria-labelledby="scan-exclude-rules">
                <SettingsCardHeader
                  icon={<ScanExcludeIcon />}
                  title="扫描排除规则"
                  titleId="scan-exclude-rules"
                  subtitle="命中的内容不会参与扫描、选择和导出。规则适用于所有项目，并从下次扫描开始生效。"
                  actionInline
                  action={(
                    <button ref={ruleHelpButtonRef} type="button" className="settings-rule-help-button"
                      aria-label="查看扫描排除规则的匹配说明" aria-haspopup="dialog"
                      aria-expanded={ruleHelpOpen} onClick={() => setRuleHelpOpen(true)}>?</button>
                  )}
                />

                <div className="settings-card__content settings-card__content--scan-rules">
                  {ruleWarning && <div className="settings-rule-warning" role="status">{ruleWarning}</div>}

                  {ruleLoading ? (
                    <div className="settings-rule-loading" aria-live="polite">正在读取规则…</div>
                  ) : ruleLoadError ? (
                    <div className="settings-rule-error" role="alert">
                      <span>{ruleLoadError}</span>
                      <button type="button" onClick={() => void loadRules()}>重试</button>
                    </div>
                  ) : (
                    <>
                      <div className="settings-rule-list" role="list" aria-labelledby="scan-exclude-rules">
                        {rules.length === 0 && (
                          <div className="settings-rule-empty">
                            <strong>暂未设置排除规则</strong>
                            <span>扫描时仍会遵循项目自身的 .gitignore</span>
                          </div>
                        )}
                        {rules.map((rule, index) => {
                          const builtInHelp = getBuiltInScanExcludeRuleHelp(rule);
                          const isEditing = focusedRuleIndex === index;
                          const detailId = `scan-exclude-rule-detail-${index}`;
                          return (
                            <div className={`settings-rule-row${ruleErrors[index] ? ' has-error' : ''}${builtInHelp ? ' has-builtin-help' : ''}${isEditing ? ' is-editing' : ''}`}
                              role="listitem" key={index}>
                              <span
                                className={`settings-rule-row__kind settings-rule-row__kind--${builtInHelp ? 'builtin' : 'custom'}`}
                                role="img"
                                aria-label={builtInHelp ? '内置规则' : '自定义规则'}
                                title={builtInHelp ? '内置规则' : '自定义规则'}
                              >
                                {builtInHelp ? <BuiltInRuleIcon /> : <CustomRuleIcon />}
                              </span>
                              <div className="settings-rule-row__field">
                                <div className="settings-rule-row__value">
                                  <input
                                    value={rule}
                                    size={builtInHelp && !isEditing ? Math.min(Math.max(rule.length + 1, 9), 26) : undefined}
                                    aria-label={`${builtInHelp ? '内置' : '自定义'}排除规则${builtInHelp ? `，${builtInHelp.detail}` : ''}`}
                                    aria-describedby={builtInHelp && !isEditing ? detailId : undefined}
                                    aria-invalid={Boolean(ruleErrors[index])}
                                    onFocus={() => setFocusedRuleIndex(index)}
                                    onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                                    onBlur={() => {
                                      if (!ruleErrors[index]) setRules((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeScanExcludeRule(item) : item));
                                      setFocusedRuleIndex((current) => current === index ? null : current);
                                    }}
                                  />
                                  {builtInHelp && !isEditing && (
                                    <span id={detailId} className="settings-rule-row__detail">{builtInHelp.detail}</span>
                                  )}
                                </div>
                                {ruleErrors[index] && <span role="alert">{ruleErrors[index]}</span>}
                              </div>
                              <button type="button" className="settings-rule-row__delete"
                                aria-label={`删除规则 ${rule || index + 1}`}
                                title="删除"
                                onClick={() => {
                                  setFocusedRuleIndex(null);
                                  setRules((current) => current.filter((_, itemIndex) => itemIndex !== index));
                                }}>
                                <DeleteRuleIcon />
                              </button>
                              {builtInHelp && !isEditing && (
                                <div className="settings-rule-row__help" role="tooltip">
                                  <strong>为什么默认排除</strong>
                                  <span>{builtInHelp.reason}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <form className={`settings-rule-add${newRuleError ? ' has-error' : ''}`} onSubmit={handleAddRule}>
                        <div className="settings-rule-add__field">
                          <label className="settings-rule-add__label" htmlFor="new-scan-exclude-rule">添加文件夹名称或路径匹配规则</label>
                          <input id="new-scan-exclude-rule" value={newRule} placeholder="例如 node_modules、*.min.js 或 packages/*/dist" aria-label="新增排除规则"
                            aria-invalid={Boolean(newRuleError)}
                            onChange={(event) => { setNewRule(event.target.value); setNewRuleError(null); }} />
                          {newRuleError && <span role="alert">{newRuleError}</span>}
                        </div>
                        <button type="submit" className="btn-ghost">新增</button>
                      </form>

                      <div className="settings-rule-syntax">
                        <span>不含通配符时按文件夹处理；含通配符时按文件或文件夹路径匹配。 <code>*</code> 匹配当前层级，<code>**</code> 可跨目录层级，<code>?</code> 匹配一个字符。</span>
                      </div>

                      <div className="settings-rule-footer">
                        <div className="settings-rule-footer__status" aria-live="polite">
                          {rulesDirty ? '有未保存更改' : '已保存'} · 仅从下次扫描开始生效
                        </div>
                        <div className="settings-rule-footer__actions">
                          <button type="button" className="btn-ghost"
                            disabled={ruleSaving || !canResetScanExcludeRules(ruleSource, rulesDirty, ruleWarning)}
                            onClick={() => void handleResetRules()}>恢复默认</button>
                          <button type="button" className="btn-primary" disabled={ruleSaving || rulesInvalid || !rulesDirty}
                            onClick={() => void handleSaveRules()}>{ruleSaving ? '处理中…' : '保存规则'}</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>

            <aside className="settings-info-stack" aria-label="应用设置与信息">
              <section className="settings-card" aria-labelledby="software-update-title">
                <SettingsCardHeader icon={<UpdateIcon />} title="软件更新" titleId="software-update-title" />
                <div className="settings-card__content settings-card__content--compact">
                  <div className="settings-update-state" aria-live="polite">
                    <div className="software-update__heading">
                      <strong>{updateStatusTitle(updateState)}</strong>
                      <span className={`software-update__channel software-update__channel--${updateState?.channel ?? 'stable'}`}>
                        {updateState?.channel === 'beta' ? 'Beta' : 'Stable'}
                      </span>
                    </div>
                    <span>{updateState?.message ?? '正在读取正式更新渠道…'}</span>
                    <span className="software-update__meta">
                      当前 v{updateState?.currentVersion ?? __APP_VERSION__}
                      {updateState?.targetVersion ? ` · 最新 v${updateState.targetVersion}` : ''}
                    </span>
                    {updateState?.phase === 'downloading' && updateState.progress && (
                      <div className="software-update__progress" aria-label={`更新下载进度 ${updateState.progress.percent}%`}>
                        <div className="software-update__progress-track">
                          <span style={{ width: `${updateState.progress.percent}%` }} />
                        </div>
                        <span>
                          {updateState.progress.percent}% · {formatBytes(updateState.progress.transferred)} / {formatBytes(updateState.progress.total)}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn-ghost software-update__action"
                      disabled={!updateState?.supported || updateActionPending
                        || updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing'}
                      onClick={() => void handleUpdateAction()}
                    >
                      {updateActionPending ? '处理中…' : updateActionLabel(updateState)}
                    </button>
                  </div>
                </div>
              </section>

              <section className="settings-card" aria-labelledby="privacy-settings-title">
                <SettingsCardHeader icon={<PrivacyIcon />} title="隐私说明" titleId="privacy-settings-title" />
                <div className="settings-card__content settings-card__content--compact settings-privacy-copy">
                  CodeDoc 的扫描、清洗、脱敏、排版与导出全部在本机完成，您的源代码<strong>永远不会离开这台电脑</strong>。正式安装版仅为检查和下载应用更新连接 IdeaBox 官方下载域名，不上传项目内容。
                </div>
              </section>

              <section className="settings-card settings-card--about" aria-labelledby="about-codedoc">
                <SettingsCardHeader icon={<AboutIcon />} title="关于" titleId="about-codedoc"
                  action={<span className="about-card__version">v{__APP_VERSION__}</span>} />
                <div className="settings-card__content settings-card__content--about">
                  <div className="about-card__product-name">CodeDoc Generator</div>
                  <p className="about-card__summary">
                    一款免费、离线的软著代码整理工具。让繁琐的申报工作尽可能简化，变成一段舒心而清晰的本地流程。
                  </p>

                  <div className="about-card__meta">
                    <span className="about-card__free"><span aria-hidden="true" />免费软件</span>
                    <span>Apache-2.0 许可</span>
                  </div>

                  <div className="about-card__footer">
                    <div className="about-card__byline">
                      <strong>软著代码整理器</strong>
                    </div>
                    <span>一键生成软著代码审核材料</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {ruleHelpOpen && (
        <div className="settings-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRuleHelpOpen(false);
        }}>
          <div ref={ruleHelpDialogRef} className="settings-dialog settings-rule-help-dialog" role="dialog"
            aria-modal="true" aria-labelledby="scan-exclude-help-title" tabIndex={-1}>
            <div className="settings-dialog__header">
              <h2 id="scan-exclude-help-title">规则说明</h2>
              <button type="button" className="btn-ghost settings-dialog__close" aria-label="关闭规则说明"
                onClick={() => setRuleHelpOpen(false)}>×</button>
            </div>
            <div className="settings-dialog__body settings-rule-help-dialog__body">
              <section aria-labelledby="scan-exclude-help-examples">
                <h3 id="scan-exclude-help-examples">看示例最快理解</h3>
                <div className="settings-rule-help-examples">
                  <div className="settings-rule-help-example">
                    <code>node_modules</code>
                    <div><strong>忽略同名文件夹</strong><span>项目中无论藏得多深，只要文件夹名称正好是 node_modules，就会连同里面的内容一起跳过。</span></div>
                  </div>
                  <div className="settings-rule-help-example">
                    <code>src/generated</code>
                    <div><strong>忽略指定位置的文件夹</strong><span>只跳过项目根目录下的 src/generated；其他位置的同名文件夹不受影响。</span></div>
                  </div>
                  <div className="settings-rule-help-example">
                    <code>*.min.js</code>
                    <div><strong>忽略符合名称特征的文件</strong><span>跳过任意位置以 .min.js 结尾的文件，例如 app.min.js。</span></div>
                  </div>
                  <div className="settings-rule-help-example">
                    <code>packages/*/dist</code>
                    <div><strong>忽略一组结构相同的文件夹</strong><span>可匹配 packages/app/dist、packages/web/dist 等目录，并跳过它们的全部内容。</span></div>
                  </div>
                  <div className="settings-rule-help-example">
                    <code>**/README.md</code>
                    <div><strong>忽略任意位置的精确文件名</strong><span>无论 README.md 位于项目根目录还是更深的目录中，都会被跳过。</span></div>
                  </div>
                </div>
              </section>

              <section aria-labelledby="scan-exclude-help-symbols">
                <h3 id="scan-exclude-help-symbols">三个通配符</h3>
                <div className="settings-rule-help-symbols">
                  <div>
                    <div className="settings-rule-help-symbol__heading"><code>*</code><strong>当前层级</strong></div>
                    <span>匹配同一层级里的任意名称，但不会跨过文件夹。</span>
                  </div>
                  <div>
                    <div className="settings-rule-help-symbol__heading"><code>**</code><strong>多个层级</strong></div>
                    <span>可以跨过任意数量的文件夹。</span>
                  </div>
                  <div>
                    <div className="settings-rule-help-symbol__heading"><code>?</code><strong>一个字符</strong></div>
                    <span>例如 file?.ts 可匹配 file1.ts，但不能匹配 file10.ts。</span>
                  </div>
                </div>
              </section>

              <section aria-labelledby="scan-exclude-help-note">
                <h3 id="scan-exclude-help-note">填写时注意</h3>
                <p className="settings-rule-help-dialog__warning"><code>/</code> 表示文件夹层级；所有路径都从项目根目录开始计算，不能填写绝对路径或 <code>..</code>。</p>
              </section>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
