import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  canResetScanExcludeRules, getScanExcludeRuleErrors, normalizeScanExcludeRule, normalizeScanExcludeRules,
  sameScanExcludeRules, validateScanExcludeRule,
} from '../scan-exclude-rules';
import { toast, useStore } from '../store';

export default function Settings() {
  const s = useStore();
  const [rules, setRules] = useState<string[]>([]);
  const [savedRules, setSavedRules] = useState<string[]>([]);
  const [ruleSource, setRuleSource] = useState<'default' | 'user'>('default');
  const [ruleWarning, setRuleWarning] = useState<string | null>(null);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleLoadError, setRuleLoadError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);
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
      applyRuleResult(await window.cs.getScanExcludes());
    } catch (error) {
      setRuleLoadError(error instanceof Error ? error.message : '无法读取排除规则');
    } finally {
      setRuleLoading(false);
    }
  };

  useEffect(() => { void loadRules(); }, []);

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
      applyRuleResult(await window.cs.saveScanExcludes(normalizeScanExcludeRules(rules)));
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
      applyRuleResult(await window.cs.resetScanExcludes());
      setNewRule('');
      setNewRuleError(null);
      toast('已恢复内置默认规则，将从下次扫描开始生效');
    } catch (error) {
      toast(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuleSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-heading">
          <button className="btn-ghost settings-heading__back" onClick={() => s.set({ view: 'wizard' })} aria-label="返回工作区">←</button>
          <div>
            <h1>设置</h1>
            <p>管理默认规则与应用信息</p>
          </div>
        </header>

        <div className="settings-content">
          <section className="update-card" aria-label="版本维护状态">
            <div className="update-card__content">
              <div className="update-card__eyebrow">MAINTENANCE · 维护状态</div>
              <div className="update-card__title">更新渠道迁移中</div>
              <div className="update-card__detail">当前 v{__APP_VERSION__} · 自动版本检测已关闭，待新维护仓库确定后恢复</div>
            </div>
          </section>

          <div className="settings-grid">
          <div className="settings-stack">
            <section className="settings-card">
              <div className="settings-rule-heading">
                <div>
                  <div id="scan-exclude-rules" className="settings-card__title">扫描排除规则</div>
                  <div className="settings-card__description">对所有项目生效的目录名或文件 glob</div>
                </div>
                {!ruleLoading && !ruleLoadError && (
                  <span className={`settings-rule-source settings-rule-source--${ruleSource}`}>
                    {ruleSource === 'default' ? '内置默认' : '用户自定义'}
                  </span>
                )}
              </div>

              <div className="settings-rule-note">
                <strong>规则来源</strong>
                <span>此处为应用级规则；项目中的 <code>.gitignore</code> 会独立叠加。文件页的选中状态仅属于当前项目。</span>
              </div>

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
                    {rules.map((rule, index) => (
                      <div className={`settings-rule-row${ruleErrors[index] ? ' has-error' : ''}`} role="listitem" key={index}>
                        <span className="settings-rule-row__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <div className="settings-rule-row__field">
                          <input
                            value={rule}
                            aria-label={`排除规则 ${index + 1}`}
                            aria-invalid={Boolean(ruleErrors[index])}
                            onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                            onBlur={() => {
                              if (!ruleErrors[index]) setRules((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeScanExcludeRule(item) : item));
                            }}
                          />
                          {ruleErrors[index] && <span role="alert">{ruleErrors[index]}</span>}
                        </div>
                        <button type="button" className="settings-rule-row__delete"
                          aria-label={`删除规则 ${rule || index + 1}`}
                          onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>

                  <form className={`settings-rule-add${newRuleError ? ' has-error' : ''}`} onSubmit={handleAddRule}>
                    <div className="settings-rule-add__field">
                      <input value={newRule} placeholder="例如 packages/*/dist/ 或 *.min.js" aria-label="新增排除规则"
                        aria-invalid={Boolean(newRuleError)}
                        onChange={(event) => { setNewRule(event.target.value); setNewRuleError(null); }} />
                      {newRuleError && <span role="alert">{newRuleError}</span>}
                    </div>
                    <button type="submit" className="btn-ghost">新增</button>
                  </form>

                  <div className="settings-rule-syntax">
                    使用 <code>/</code> 表示目录层级，支持 <code>*</code>、<code>**</code> 和 <code>?</code>；不能填写绝对路径或 <code>..</code>。
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
            </section>

          </div>

          <aside className="settings-info-stack" aria-label="应用信息">
            <section className="settings-card settings-card--privacy">
              <div className="settings-card__title settings-card__title--with-icon">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="var(--green)" strokeWidth="1.4" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="var(--green)" strokeWidth="1.4" /></svg>
                隐私说明
              </div>
              <div className="settings-card__body">
                CodeSucker 的扫描、清洗、脱敏、排版与导出全部在本机完成，您的源代码<span>永远不会离开这台电脑</span>。当前维护基线已关闭版本检测，产品功能不发起网络请求。
              </div>
            </section>

            <section className="about-card" aria-labelledby="about-codesucker">
              <div className="about-card__header">
                <div style={{ minWidth: 0 }}>
                  <div className="about-card__eyebrow">ABOUT · 关于</div>
                  <div id="about-codesucker" className="about-card__title">CodeSucker</div>
                </div>
                <span className="about-card__version">v{__APP_VERSION__}</span>
              </div>

              <p className="about-card__summary">
                一款免费、离线的软著代码整理工具。希望把繁琐的申报准备，变成一段安心而清晰的本地流程。
              </p>

              <div className="about-card__meta">
                <span className="about-card__free"><span aria-hidden="true" />免费软件</span>
                <span>Apache-2.0 许可</span>
              </div>

              <div className="about-card__craft">
                原始项目由 fanbuz 创建，当前为恢复后的维护基线。
              </div>

              <div className="about-card__footer">
                <div className="about-card__byline">
                  原作者 <strong>fanbuz</strong>
                </div>
                <span>新维护地址待确定</span>
              </div>
            </section>

          </aside>
          </div>
        </div>
      </div>

    </div>
  );
}
