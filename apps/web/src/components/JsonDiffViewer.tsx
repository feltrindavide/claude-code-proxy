'use client';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import * as jsondiffpatch from 'jsondiffpatch';
import { format as formatHtml } from 'jsondiffpatch/formatters/html';
import 'jsondiffpatch/formatters/styles/annotated.css';
import 'jsondiffpatch/formatters/styles/html.css';

interface JsonDiffViewerProps {
  current: object;
  incoming: object;
}

export function JsonDiffViewer({ current, incoming }: JsonDiffViewerProps) {
  const html = useMemo(() => {
    const delta = jsondiffpatch.diff(current, incoming);
    if (!delta) return '<p class="text-muted text-sm">No differences detected</p>';
    const raw = formatHtml(delta, current) || '<p class="text-muted text-sm">No differences detected</p>';
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [current, incoming]);

  return (
    <div
      className="jsondiffpatch-wrapper overflow-auto max-h-[60vh]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
