import { useEffect, useState } from 'react';
import { runProcess, useStore, type PageData } from '../store';
import { previewThumbnailTag } from '../preview-layout';
import { unlockStep } from '../wizard-progress';

export default function Step4Preview() {
  const s = useStore();
  const p = s.processData;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => { if (!p) void runProcess(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p) return;
    let active = true;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setPdfError(null);
    useStore.getState().set({ pdfPreviewKey: null });

    void window.codedoc.previewPdf(p.documentKey, p.scanSessionId).then((result) => {
      if (!active || result.documentKey !== p.documentKey) return;
      const bytes = new Uint8Array(result.data);
      objectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: 'application/pdf' }));
      setPdfUrl(objectUrl);
      useStore.getState().set({ pdfPreviewKey: result.documentKey });
    }).catch((error) => {
      if (!active) return;
      setPdfError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [p?.documentKey, retryVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="step4-empty">正在生成分页…</div>;

  const pages = p.selection.pages;
  const split = p.selection.splitAfterPage;
  const thumbsA = split ? pages.slice(0, split) : pages;
  const thumbsB = split ? pages.slice(split) : [];
  const detail = p.selection.truncated
    ? `前段止于 ${p.selection.frontEndFile ?? '未知文件'} · 后段起于 ${p.selection.backStartFile ?? '未知文件'}`
    : '完整代码已选择分页';
  const previewReady = !!pdfUrl && s.pdfPreviewKey === p.documentKey;

  const Thumb = ({ pg }: { pg: PageData }) => {
    const active = pg.no === s.page;
    const tag = previewThumbnailTag(pg.no, pages.length);
    return (
      <button type="button" className={`step4-thumb${tag ? ' is-tagged' : ''}`} onClick={() => s.set({ page: pg.no })}
        title={`第 ${pg.no} 页`} aria-label={`查看第 ${pg.no} 页`} aria-current={active ? 'page' : undefined}>
        <span className="step4-thumb__tag" style={{ visibility: tag ? 'visible' : 'hidden' }} aria-hidden={!tag}>
          {tag ?? '模块结尾 ✓'}
        </span>
        <span className={`step4-thumb__paper${active ? ' is-active' : ''}`} />
        <span className={`step4-thumb__number${active ? ' is-active' : ''}`}>{pg.no}</span>
      </button>
    );
  };

  return (
    <div className="step4-preview">
      <header className="step4-info" title={`共 ${pages.length} 页 · ${p.selection.pickedLines.toLocaleString()} 行 · ${detail}`}>
        <span className="step4-info__summary">最终 PDF 预览 · 共 {pages.length} 页 · {p.selection.pickedLines.toLocaleString()} 行</span>
        <span className="step4-info__detail">{detail}</span>
      </header>

      <div className="step4-stage" tabIndex={0} aria-label="最终 PDF 文档预览">
        {pdfError ? (
          <div className="step4-pdf-status is-error">
            <strong>PDF 预览生成失败</strong>
            <span>{pdfError}</span>
            <button type="button" className="btn-ghost" onClick={() => setRetryVersion((value) => value + 1)}>重新生成</button>
          </div>
        ) : !pdfUrl ? (
          <div className="step4-pdf-status">
            <span className="step4-pdf-spinner" aria-hidden="true" />
            <strong>正在生成最终 PDF 预览…</strong>
            <span>完成后导出将复用同一份文档</span>
          </div>
        ) : (
          <iframe key={`${p.documentKey}:${s.page}`} className="step4-pdf-viewer" title="最终 PDF 预览"
            src={`${pdfUrl}#page=${s.page}&zoom=page-fit`} />
        )}
      </div>

      <footer className="step4-footer">
        <div className="step4-thumbs" tabIndex={0} aria-label="PDF 分页导航">
          {thumbsA.map((pg) => <Thumb key={pg.no} pg={pg} />)}
          {p.selection.truncated && (
            <div className="step4-split" aria-label="前后段分界">
              <span>✂️</span><i /><strong>前后段分界</strong>
            </div>
          )}
          {thumbsB.map((pg) => <Thumb key={pg.no} pg={pg} />)}
        </div>
        <button className="btn-primary step4-next" disabled={!previewReady}
          title={previewReady ? undefined : '请等待最终 PDF 预览生成完成'}
          onClick={() => s.set({ step: 5, maxUnlockedStep: unlockStep(s.maxUnlockedStep, 5) })}>
          {previewReady ? '下一步：校验与导出' : '正在生成 PDF…'}
        </button>
      </footer>
    </div>
  );
}
