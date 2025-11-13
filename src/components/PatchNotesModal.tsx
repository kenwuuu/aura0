import React from 'react';
import patchNotesContent from '../content/patchNotes.md?raw';

interface PatchNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const styles = {
  modal: {
    maxWidth: '700px',
    width: '95%',
    maxHeight: '80vh',
  } as React.CSSProperties,
  content: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#e5e7eb',
  } as React.CSSProperties,
  scrollContainer: {
    maxHeight: '65vh',
    overflowY: 'scroll',
    padding: '0 4px',
  } as React.CSSProperties,
};

/**
 * Simple markdown parser for basic formatting
 * Supports: headers, bold, code blocks, lists, and paragraphs
 */
function parseMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listKey = 0;
  let elementKey = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} style={{ marginBottom: '16px', paddingLeft: '24px' }}>
          {currentList.map((item, idx) => (
            <li key={idx} style={{ marginBottom: '8px' }}>
              {parseInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const parseInlineFormatting = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining) {
      // Bold (**text**)
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      if (boldMatch) {
        const beforeBold = remaining.substring(0, boldMatch.index);
        if (beforeBold) parts.push(beforeBold);
        parts.push(
          <strong key={`bold-${key++}`} style={{ fontWeight: 'bold', color: '#60a5fa' }}>
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.substring((boldMatch.index || 0) + boldMatch[0].length);
        continue;
      }

      // Code (`code`)
      const codeMatch = remaining.match(/`([^`]+)`/);
      if (codeMatch) {
        const beforeCode = remaining.substring(0, codeMatch.index);
        if (beforeCode) parts.push(beforeCode);
        parts.push(
          <code
            key={`code-${key++}`}
            style={{
              backgroundColor: '#1f2937',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: "'Courier New', monospace",
              fontSize: '13px',
              color: '#10b981',
            }}
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.substring((codeMatch.index || 0) + codeMatch[0].length);
        continue;
      }

      // No more formatting, add the rest
      parts.push(remaining);
      break;
    }

    return parts;
  };

  lines.forEach((line) => {
    // H1
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1
          key={`h1-${elementKey++}`}
          style={{
            fontSize: '28px',
            fontWeight: 'bold',
            marginBottom: '16px',
            marginTop: '24px',
            color: '#f9fafb',
            borderBottom: '2px solid #3d3d3d',
            paddingBottom: '8px',
          }}
        >
          {line.substring(2)}
        </h1>
      );
      return;
    }

    // H2
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2
          key={`h2-${elementKey++}`}
          style={{
            fontSize: '22px',
            fontWeight: 'bold',
            marginBottom: '12px',
            marginTop: '24px',
            color: '#f3f4f6',
          }}
        >
          {line.substring(3)}
        </h2>
      );
      return;
    }

    // H3
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3
          key={`h3-${elementKey++}`}
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '10px',
            marginTop: '20px',
            color: '#60a5fa',
          }}
        >
          {line.substring(4)}
        </h3>
      );
      return;
    }

    // List item
    if (line.startsWith('- ')) {
      currentList.push(line.substring(2));
      return;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${elementKey++}`} style={{ marginBottom: '12px' }}>
        {parseInlineFormatting(line)}
      </p>
    );
  });

  flushList(); // Flush any remaining list items

  return elements;
}

export const PatchNotesModal: React.FC<PatchNotesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const content = parseMarkdown(patchNotesContent);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Patch Notes
          </h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={styles.scrollContainer}>
            <div style={styles.content}>{content}</div>
          </div>
        </div>
      </div>
    </div>
  );
};