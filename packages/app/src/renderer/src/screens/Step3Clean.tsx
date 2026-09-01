import { useEffect, useState } from 'react';
import { runProcess, useStore, type CleanToggles, type ProcessData } from '../store';
import { unlockStep } from '../wizard-progress';

const TOGGLES: Array<{ key: keyof CleanToggles; label: string; sub?: string }> = [
  { key: 'removeComments', label: '删除注释' },
  { key: 'removeBlankLines', label: '删除空行' },
  { key: 'maskSensitive', label: '敏感信息脱敏', sub: 'API 密钥 / 密码 / 内网 IP / 手机号' },
  { key: 'wrapLongLines', label: '超长行自动折行' },
];

export default function Step3Clean() {
  const s = useStore();
  const p = s.processData;
  const currentPreview = p?.preview ?? null;
  const [lastPreview, setLastPreview] = useState<NonNullable<ProcessData['preview']> | null>(currentPreview);
  const preview = currentPreview ?? lastPreview;
  const progress = s.jobProgress?.jobKind === 'process' ? s.jobProgress : null;
  const requiredFieldsComplete = Boolean(s.swName.trim() && s.owner.trim());

  useEffect(() => { runProcess(); }, [s.clean]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentPreview) setLastPreview(currentPreview);
  }, [currentPreview]);

  return (
    <div className="step3-clean">
      <div className="step3-controls">
        <div className="step3-controls__scroll" tabIndex={0} aria-label="清洗与排版设置">
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>软件全称 + 版本号 <span style={{ color: 'var(--red)' }}>*</span></div>
            <input className="codedoc-input" value={s.swName} placeholder="如：智慧校园图书馆管理系统 V1.0" required
              onChange={(e) => s.set({ swName: e.target.value, processData: null, pdfPreviewKey: null })} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>将作为每页页眉，须与申请表完全一致，否则会被退回补正</div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>著作权人名称 <span style={{ color: 'var(--red)' }}>*</span></div>
            <input className="codedoc-input" value={s.owner} placeholder="如：杭州某某科技有限公司" required
              onChange={(e) => s.set({ owner: e.target.value, processData: null, pdfPreviewKey: null })} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>将作为每页页脚，同时会用于署名冲突校验</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TOGGLES.map((t) => {
              const on = s.clean[t.key];
              return (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 9, background: 'var(--panel2)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                    {t.sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.sub}</div>}
                  </div>
                  <button type="button" role="switch" aria-checked={on} aria-label={t.label}
                    onClick={() => s.set({ clean: { ...s.clean, [t.key]: !on }, processData: null, pdfPreviewKey: null })}
                    style={{ width: 34, height: 20, padding: 0, border: 0, flex: 'none', borderRadius: 10, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .15s' }}>
                    <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-switch-thumb)', boxShadow: 'var(--switch-thumb-shadow)', transition: 'left .15s' }} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="step3-layout">
            <div className="step3-layout__header">
              <div style={{ fontSize: 13, fontWeight: 500 }}>排版参数</div>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>宋体 · 10.5pt · 12pt 行距 · 每页 60 行</span>
            </div>
            <div className="step3-layout__options">
              {[['字体', '宋体'], ['字号', '10.5pt'], ['行距', '固定值 12pt'], ['每页行数', '60']].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{k}</div>
                  <div style={{ height: 30, border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, background: 'var(--panel)' }}>{v}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                官网要求每页不少于 50 行；当前版本按每页 60 行排版，并用分页符显式控制
              </div>
            </div>
          </div>
        </div>

        <div className="step3-controls__footer">
          <button className="btn-primary" disabled={!requiredFieldsComplete || s.processing}
            onClick={async () => {
              if (!s.processData) await runProcess();
              s.set({ step: 4, maxUnlockedStep: unlockStep(s.maxUnlockedStep, 4), page: 1 });
            }}>
            {s.processing
              ? progress?.stage === 'cleaning' && progress.total > 0
                ? `正在清洗 ${progress.completed}/${progress.total}…`
                : progress?.stage === 'selecting'
                  ? '正在分页…'
                  : progress?.stage === 'auditing'
                    ? '正在校验…'
                    : '正在准备…'
              : '下一步：分页预览'}
          </button>
        </div>
      </div>

      {/* 实时预览 */}
      <div className="step3-preview" tabIndex={0} aria-label="清洗结果实时预览">
        {!preview ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
            {s.processing ? '正在清洗代码…' : '暂无预览'}
          </div>
        ) : (
          <>
            <div className="step3-preview__title">预览文件：{preview.file}</div>
            <div className="step3-preview__comparison">
              <section className="step3-preview-card" aria-label="清洗前预览">
                <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', background: 'var(--panel2)', borderBottom: '1px solid var(--border2)' }}>清洗前</div>
                <div className="step3-preview-card__body" style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.75 }}>
                  {preview.before.map((b) => (
                    <div key={b.n} style={{ display: 'flex', gap: 12, background: b.kind === 'comment' ? 'var(--red-soft)' : 'transparent', borderRadius: 4, padding: '0 6px', margin: '0 -6px' }}>
                      <span style={{ width: 18, textAlign: 'right', color: 'var(--text3)', flex: 'none', userSelect: 'none' }}>{b.n}</span>
                      <span style={{ color: b.kind === 'comment' ? 'var(--red)' : b.masked ? 'var(--orange)' : 'var(--text)', textDecoration: b.kind === 'comment' ? 'line-through' : 'none', whiteSpace: 'pre' }}>{b.text || ' '}</span>
                    </div>
                  ))}
                </div>
              </section>
              <div className="step3-preview__divider">↓ 清洗后</div>
              <section className="step3-preview-card" aria-label="清洗后预览">
                <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-soft)', borderBottom: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>清洗后</span>
                  <span style={{ fontWeight: 400 }}>已删 {preview.removedComments} 行注释 · {preview.removedBlanks} 空行 · 脱敏 {preview.masked} 处</span>
                </div>
                <div className="step3-preview-card__body" style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.75 }}>
                  {preview.after.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ width: 18, textAlign: 'right', color: 'var(--text3)', flex: 'none', userSelect: 'none' }}>{i + 1}</span>
                      <span style={{ whiteSpace: 'pre', background: a.masked ? 'var(--orange-soft)' : 'transparent', color: a.masked ? 'var(--orange)' : 'var(--text)', borderRadius: 3 }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
