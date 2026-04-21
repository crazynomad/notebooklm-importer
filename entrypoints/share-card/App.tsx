import { useState, useEffect, useRef } from 'react';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { marked } from 'marked';
import type { QAPair } from '@/lib/types';

marked.setOptions({ gfm: true, breaks: false });

const QR_URL = 'https://youtu.be/9gPTuJZRHJk';

interface ShareCardData {
  pairs: QAPair[];
  title: string;
  platform: string;
  platformIcon: string;
  url: string;
}

/** Detect Chinese locale */
function isZh(): boolean {
  return navigator.language.startsWith('zh');
}

/** Bilingual strings */
const i18n = {
  question: () => isZh() ? '提问' : 'Question',
  answer: () => isZh() ? '回答' : 'Answer',
  madeWith: () => isZh()
    ? 'Made with ❤️ by YouTuber「绿皮火车」'
    : 'Made with ❤️ by YouTuber「绿皮火车」',
  platformLabel: (key: string, fallback: string) => {
    const zh: Record<string, string> = {
      claude: 'Claude · AI 对话',
      chatgpt: 'ChatGPT · AI 对话',
      gemini: 'Gemini · AI 对话',
    };
    const en: Record<string, string> = {
      claude: 'Claude · AI Conversation',
      chatgpt: 'ChatGPT · AI Conversation',
      gemini: 'Gemini · AI Conversation',
    };
    const dict = isZh() ? zh : en;
    return dict[key] || `${fallback} · AI`;
  },
};

type ExportFormat = 'jpeg' | 'png' | 'pdf' | 'clipboard';

export function ShareCardApp() {
  const [data, setData] = useState<ShareCardData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showIsland, setShowIsland] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get('shareCardData', (result) => {
      if (result.shareCardData) {
        setData(result.shareCardData);
        chrome.storage.local.remove('shareCardData');
      }
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filename = data?.title || 'share-card';
  const pixelRatio = 3;

  // Cache the high-res canvas to avoid re-rendering fonts/DOM on each export
  const canvasCacheRef = useRef<HTMLCanvasElement | null>(null);
  const cacheKeyRef = useRef<string>('');

  const getCanvas = async (): Promise<HTMLCanvasElement> => {
    if (!cardRef.current) throw new Error('Card ref not ready');
    // Invalidate cache when island toggle or content changes
    const key = `${showIsland}-${data?.pairs.length}-${data?.title}`;
    if (canvasCacheRef.current && cacheKeyRef.current === key) {
      return canvasCacheRef.current;
    }
    const canvas = await toCanvas(cardRef.current, {
      pixelRatio,
      backgroundColor: '#f6f1ea',
    });
    canvasCacheRef.current = canvas;
    cacheKeyRef.current = key;
    return canvas;
  };

  const handleSave = async (format: ExportFormat = 'jpeg') => {
    if (!cardRef.current) return;
    setSaving(true);
    setShowDropdown(false);
    try {
      const canvas = await getCanvas();

      if (format === 'jpeg') {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        downloadDataUrl(dataUrl, `${filename}.jpg`);
      } else if (format === 'png') {
        const dataUrl = canvas.toDataURL('image/png');
        downloadDataUrl(dataUrl, `${filename}.png`);
      } else if (format === 'pdf') {
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const pdfWidth = 100;
        const pdfHeight = (imgHeight / imgWidth) * pdfWidth;
        const pdf = new jsPDF({
          orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
          unit: 'mm',
          format: [pdfWidth, pdfHeight],
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${filename}.pdf`);
      } else if (format === 'clipboard') {
        canvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
          }
        }, 'image/png');
      }
    } catch (err) {
      console.error('Failed to save card:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="loading">
        <p>Loading...</p>
      </div>
    );
  }

  const platformKey = data.platform?.toLowerCase() || '';
  const platformLabel = i18n.platformLabel(platformKey, data.platform);

  return (
    <div className="page">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="save-group" ref={dropdownRef}>
          <button
            onClick={() => handleSave('jpeg')}
            disabled={saving}
            className="save-btn"
          >
            {saving ? 'Saving\u2026' : 'Save JPEG'}
          </button>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            disabled={saving}
            className="save-btn save-dropdown-toggle"
            aria-label="More formats"
          >
            ▾
          </button>
          {showDropdown && (
            <div className="save-dropdown">
              <button onClick={() => handleSave('png')}>PNG</button>
              <button onClick={() => handleSave('pdf')}>PDF</button>
              <button onClick={() => handleSave('clipboard')}>Clipboard</button>
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showIsland}
            onChange={(e) => setShowIsland(e.target.checked)}
            style={{ accentColor: '#c4553a' }}
          />
          <span className="hint">Dynamic Island</span>
        </label>
        <span className="hint" style={{ marginLeft: 'auto' }}>3x retina</span>
      </div>

      {/* Card preview */}
      <div className="card-wrapper">
        <div ref={cardRef} className="card">
          {/* Safe area for Dynamic Island */}
          {showIsland && (
            <div className="card-safe-area">
              <div className="dynamic-island" />
            </div>
          )}

          {/* Header */}
          <div className="card-header" style={!showIsland ? { paddingTop: 28 } : undefined}>
            <div className="platform-label">{platformLabel}</div>
            <h1 className="card-title">{data.title}</h1>
          </div>

          {/* Q&A pairs */}
          <div className="pairs">
            {data.pairs.map((pair, i) => (
              <div key={pair.id}>
                <div className="pair">
                  {pair.question && (
                    <div className="question-block">
                      <div className="role-label">{i18n.question()}</div>
                      <div className="question-text">{renderMarkdown(pair.question)}</div>
                    </div>
                  )}
                  {pair.answer && (
                    <div className="answer-block">
                      <div className="answer-label">{i18n.answer()}</div>
                      <div className="answer-text">{renderMarkdown(pair.answer)}</div>
                    </div>
                  )}
                </div>
                {i < data.pairs.length - 1 && (
                  <div className="pair-divider">· · ·</div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="card-footer">
            <div className="footer-left">
              <span className="footer-brand">NotebookLM Jetpack</span>
              <span className="footer-made-with">{i18n.madeWith()}</span>
            </div>
            <div className="footer-qr">
              <QRCodeSVG
                value={QR_URL}
                size={52}
                bgColor="transparent"
                fgColor="#8a7e70"
                level="M"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Render markdown via marked's token AST, mapped to React nodes.
 * Walking the AST (instead of marked's HTML output + dangerouslySetInnerHTML)
 * eliminates the XSS surface from any raw HTML that survives Turndown
 * (e.g. <iframe>, <script>) — unknown tokens just get stringified as text.
 */
function renderMarkdown(md: string): React.ReactNode {
  if (!md?.trim()) return null;
  const tokens = marked.lexer(md);
  return tokens.map((tok, i) => renderBlockToken(tok, `b${i}`));
}

type AnyToken = { type: string; [k: string]: any };

function renderBlockToken(tok: AnyToken, key: string): React.ReactNode {
  switch (tok.type) {
    case 'paragraph':
      return <p key={key}>{renderInlineTokens(tok.tokens)}</p>;
    case 'heading': {
      const level = Math.min(Math.max(tok.depth || 2, 2), 4);
      const Tag = (`h${level}` as 'h2');
      return <Tag key={key}>{renderInlineTokens(tok.tokens)}</Tag>;
    }
    case 'blockquote':
      return (
        <blockquote key={key}>
          {(tok.tokens as AnyToken[]).map((t, i) => renderBlockToken(t, `${key}-${i}`))}
        </blockquote>
      );
    case 'list': {
      const items = (tok.items as AnyToken[]).map((item, i) => (
        <li key={`${key}-${i}`}>
          {(item.tokens as AnyToken[]).map((t, j) =>
            t.type === 'text'
              ? renderInlineTokens((t as any).tokens || [{ type: 'text', text: (t as any).text }])
              : renderBlockToken(t, `${key}-${i}-${j}`)
          )}
        </li>
      ));
      return tok.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'code':
      return (
        <div key={key} className="code-block">
          {tok.lang && <span className="code-lang">{tok.lang}</span>}
          <pre><code>{tok.text}</code></pre>
        </div>
      );
    case 'hr':
      return <hr key={key} />;
    case 'space':
      return null;
    case 'html':
      // Raw HTML in markdown — render as plain text to avoid XSS.
      return <p key={key}>{tok.raw}</p>;
    default:
      // Fallback: surface raw text without interpretation.
      return tok.raw ? <p key={key}>{tok.raw}</p> : null;
  }
}

function renderInlineTokens(tokens: AnyToken[] | undefined): React.ReactNode {
  if (!tokens) return null;
  return tokens.map((tok, i) => {
    const k = `i${i}`;
    switch (tok.type) {
      case 'text':
        return tok.tokens
          ? <span key={k}>{renderInlineTokens(tok.tokens)}</span>
          : <span key={k}>{tok.text}</span>;
      case 'strong':
        return <strong key={k}>{renderInlineTokens(tok.tokens)}</strong>;
      case 'em':
        return <em key={k}>{renderInlineTokens(tok.tokens)}</em>;
      case 'codespan':
        return <code key={k} className="inline-code">{tok.text}</code>;
      case 'link':
        // Render link text only — no anchor (share image is static, href adds noise)
        return <span key={k}>{renderInlineTokens(tok.tokens)}</span>;
      case 'br':
        return <br key={k} />;
      case 'del':
        return <s key={k}>{renderInlineTokens(tok.tokens)}</s>;
      case 'escape':
        return <span key={k}>{tok.text}</span>;
      case 'html':
        return <span key={k}>{tok.raw}</span>;
      default:
        return tok.raw ? <span key={k}>{tok.raw}</span> : null;
    }
  });
}
