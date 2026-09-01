import { useEffect, useState } from 'react';
import { refreshRecent, scanProject, useStore, toast } from './store';
import Step1Import from './screens/Step1Import';
import Step2Files from './screens/Step2Files';
import Step3Clean from './screens/Step3Clean';
import Step4Preview from './screens/Step4Preview';
import Step5Export from './screens/Step5Export';
import Settings from './screens/Settings';
import { canStartScan } from './scan-guard';
import { canVisitStep } from './wizard-progress';
import { APP_ICON_URL } from './brand-icons';
import AppAlert from './components/AppAlert';
import { applyTheme } from './theme-controller';

type NavigationIconName = 'organize' | 'import' | 'files' | 'clean' | 'preview' | 'export' | 'settings' | 'offline' | 'private' | 'readonly';

const STEPS: Array<{ title: string; icon: NavigationIconName }> = [
  { title: '导入项目', icon: 'import' },
  { title: '文件与排序', icon: 'files' },
  { title: '清洗与排版', icon: 'clean' },
  { title: '分页预览', icon: 'preview' },
  { title: '检验与导出', icon: 'export' },
];

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  switch (name) {
    case 'organize':
      return <svg {...common}><path d="m5 2.8.75 2.1 2.1.75-2.1.75L5 8.6l-.75-2.1-2.1-.75 2.1-.75L5 2.8Z" /><path d="M10 5.75h10M4 13l1.5 1.5 3-3M10 13h10M4 19l1.5 1.5 3-3M10 19h10" /></svg>;
    case 'import':
      return <svg {...common}><path d="M3.5 7.5h6l2-2h9v13h-17v-11Z" /><path d="M12 9v6m-2.5-2.5L12 15l2.5-2.5" /></svg>;
    case 'files':
      return <svg {...common}><path d="M7 4h12v16H7zM4 7v10" /><path d="M10 8h6m-6 4h6m-6 4h4" /></svg>;
    case 'clean':
      return <svg {...common}><path d="m5 19 10.5-10.5 2 2L7 21H5v-2Z" /><path d="m14.5 5 .8-2 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8ZM19 14l.55 1.45L21 16l-1.45.55L19 18l-.55-1.45L17 16l1.45-.55L19 14Z" /></svg>;
    case 'preview':
      return <svg {...common}><path d="M5 3.5h10l4 4v13H5v-17Z" /><path d="M15 3.5v4h4M8 12h8m-8 3h8m-8 3h5" /></svg>;
    case 'export':
      return <svg {...common}><path d="M12 3.5 19 6v5.5c0 4.2-2.7 7.5-7 9-4.3-1.5-7-4.8-7-9V6l7-2.5Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.08A1.65 1.65 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" /></svg>;
    case 'offline':
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2" /></svg>;
    case 'private':
      return <svg {...common}><path d="M4 6.5A12 12 0 0 1 20 5M6 10.5a8 8 0 0 1 12-1M8.5 14a4.5 4.5 0 0 1 7.5-.7M3 3l18 18" /></svg>;
    case 'readonly':
      return <svg {...common}><path d="M5 3.5h10l4 4v13H5v-17Z" /><path d="M15 3.5v4h4M8.5 14.5l2 2 5-5" /></svg>;
  }
}

function ThemeToggleIcon({ target }: { target: 'light' | 'dark' }) {
  if (target === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <path d="M12 2.3v2.1M12 19.6v2.1M4.3 4.3l1.5 1.5M18.2 18.2l1.5 1.5M2.3 12h2.1M19.6 12h2.1M4.3 19.7l1.5-1.5M18.2 5.8l1.5-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const s = useStore();
  const [rescanConfirmOpen, setRescanConfirmOpen] = useState(false);
  const rescanEnabled = !!s.root && s.loaded && canStartScan(s);
  const nextTheme = s.theme === 'light' ? 'dark' : 'light';
  const themeLabel = nextTheme === 'dark' ? '切换到深色模式' : '切换到浅色模式';

  useEffect(() => {
    applyTheme(s.theme);
  }, [s.theme]);

  useEffect(() => {
    void refreshRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.codedoc.onProgress((progress) => {
      const current = useStore.getState();
      if (current.activeJobId === progress.jobId) current.set({ jobProgress: progress });
    });
    return () => window.codedoc.offProgress();
  }, []);

  const saveConfig = async () => {
    if (!s.root) { toast('请先导入项目'); return; }
    await window.codedoc.saveConfig(s.root, {
      title: s.swName, owner: s.owner, sortMode: s.sortMode,
      order: s.order, excludedRelPaths: s.files.filter((f) => !f.included).map((f) => f.relPath),
      clean: s.clean, fmtPdf: s.fmtPdf, fmtDocx: s.fmtDocx, fmtTxt: s.fmtTxt, outDir: s.outDir,
    });
    toast('当前配置已保存');
  };

  const rescan = () => {
    if (!s.root || !rescanEnabled) return;
    setRescanConfirmOpen(true);
  };

  const confirmRescan = () => {
    if (!s.root || !rescanEnabled) {
      setRescanConfirmOpen(false);
      return;
    }

    setRescanConfirmOpen(false);
    void scanProject(s.root, 'rescan');
  };

  return (
    <div className="app-frame">
      {/* Windows/Linux 自绘标题栏；macOS 使用内容区内嵌的原生窗口控件。 */}
      <div className="titlebar">
        <span className="titlebar-window-title">CodeDoc</span>
        <div className="window-controls">
          <button className="winbtn" onClick={() => window.codedoc.win('minimize')}><svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button className="winbtn" onClick={() => window.codedoc.win('maximize')}><svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button className="winbtn close" onClick={() => window.codedoc.win('close')}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
        </div>
      </div>

      <div className="app-shell">
        <aside className="app-sidebar" aria-label="应用导航">
          <div className="sidebar-window-drag-region" aria-hidden="true" />
          <div className="sidebar-brand">
            <img className="sidebar-brand__logo" src={APP_ICON_URL} alt="" aria-hidden="true" />
            <div className="sidebar-brand__copy">
              <strong>软著代码整理器</strong>
              <span>一键生成软著代码审核材料</span>
            </div>
          </div>

          <nav className="sidebar-navigation" aria-label="主要功能">
            <button type="button" className={`sidebar-primary${s.view === 'wizard' ? ' is-active' : ''}`}
              aria-current={s.view === 'wizard' ? 'page' : undefined}
              onClick={() => s.set({ view: 'wizard' })}>
              <span className="sidebar-nav-icon"><NavigationIcon name="organize" /></span>
              <span>智能整理</span>
              <span className="sidebar-primary__indicator" aria-hidden="true" />
            </button>

            <div className="sidebar-steps" aria-label="智能整理步骤">
              {STEPS.map(({ title, icon }, i) => {
                const n = i + 1;
                const active = s.view === 'wizard' && s.step === n;
                const done = s.loaded && n < s.maxUnlockedStep;
                const enabled = canVisitStep(n, s.loaded, s.maxUnlockedStep);
                return (
                  <button type="button" key={n}
                    className={`sidebar-step${active ? ' is-active' : ''}${done ? ' is-complete' : ''}`}
                    disabled={!enabled}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => s.set({ step: n, view: 'wizard' })}>
                    <span className="sidebar-nav-icon"><NavigationIcon name={icon} /></span>
                    <span className="sidebar-step__title">{title}</span>
                    <span className="sidebar-step__status" aria-hidden="true">
                      {done
                        ? <svg viewBox="0 0 16 16" fill="none"><path d="m3 8.2 3.1 3.1L13 4.7" /></svg>
                        : n}
                    </span>
                  </button>
                );
              })}
            </div>

            <button type="button" className={`sidebar-primary${s.view === 'settings' ? ' is-active' : ''}`}
              aria-current={s.view === 'settings' ? 'page' : undefined}
              onClick={() => s.set({ view: 'settings' })}>
              <span className="sidebar-nav-icon"><NavigationIcon name="settings" /></span>
              <span>设置</span>
              <span className="sidebar-primary__indicator" aria-hidden="true" />
            </button>
          </nav>

          <section className="sidebar-safety" aria-labelledby="sidebar-safety-title">
            <h2 id="sidebar-safety-title">本机安全</h2>
            <ul>
              <li><span className="sidebar-safety__icon"><NavigationIcon name="offline" /></span><span><strong>源码全程离线处理</strong><small>扫描、清洗与导出均在本机完成</small></span></li>
              <li><span className="sidebar-safety__icon"><NavigationIcon name="private" /></span><span><strong>项目内容不会上传</strong><small>不连接在线服务处理项目代码</small></span></li>
              <li><span className="sidebar-safety__icon"><NavigationIcon name="readonly" /></span><span><strong>原始文件只读保护</strong><small>不修改、删除或覆盖导入源码</small></span></li>
            </ul>
          </section>
        </aside>

        <main className="app-workspace">
          <section className="route-page" aria-label={s.view === 'settings' ? '设置' : '智能整理'}>
            {s.view === 'settings' ? (
              <>
                <header className="route-header settings-route-header">
                  <div className="settings-route-header__inner">
                    <h1>设置</h1>
                    <p>管理扫描规则、界面主题与应用信息</p>
                  </div>
                </header>
                <div className="route-content">
                  <Settings />
                </div>
              </>
            ) : (
              <>
                <header className="route-header workspace-toolbar">
                  <div className="workspace-project" title={s.root ?? undefined}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3l2 2h5A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" stroke="var(--accent)" strokeWidth="1.3" /></svg>
                    <span className="workspace-project__name">{s.projName}</span>
                    {s.root && <span className="workspace-project__path">{s.root}</span>}
                  </div>
                  <div className="workspace-actions">
                    <button className="btn-ghost workspace-action" disabled={!rescanEnabled} onClick={rescan}
                      title={s.exporting ? '请等待导出写盘完成后再重新扫描' : undefined}>
                      {s.scanPhase === 'scanning' ? '正在扫描…' : s.exporting ? '导出完成后可重扫' : '重新扫描'}
                    </button>
                    <button className="btn-ghost workspace-action" disabled={!s.loaded} onClick={saveConfig}>保存配置</button>
                    <button className="btn-ghost theme-toggle" title={themeLabel} aria-label={themeLabel}
                      onClick={() => s.set({ theme: nextTheme })}>
                      <ThemeToggleIcon target={nextTheme} />
                    </button>
                  </div>
                </header>
                <div className="route-content">
                  {s.step === 1 && <Step1Import />}
                  {s.step === 2 && <Step2Files />}
                  {s.step === 3 && <Step3Clean />}
                  {s.step === 4 && <Step4Preview />}
                  {s.step === 5 && <Step5Export />}
                </div>
              </>
            )}
          </section>
        </main>
      </div>

      {rescanConfirmOpen && (
        <AppAlert
          title="重新从磁盘加载项目源码并扫描。是否继续？"
          description="软件全称、著作权人名称、清洗、排版以及导出配置会被保留。"
          onCancel={() => setRescanConfirmOpen(false)}
          onConfirm={confirmRescan}
        />
      )}

      {/* toast */}
      {s.toast && (
        <div role="status" aria-live="polite" aria-atomic="true"
          className="app-toast">{s.toast}</div>
      )}
    </div>
  );
}
