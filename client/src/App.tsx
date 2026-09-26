import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { Pin } from 'lucide-react';
import { LegalWorkspace } from './components/LegalWorkspace';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('juris_gemini_key') || '';
  });

  const [advocateName, setAdvocateName] = useState<string>(() => {
    return localStorage.getItem('juris_advocate_name') || 'ॲड. सचिन मधुकर महाजन';
  });

  const [isCopilotPinned, setIsCopilotPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem('juris_copilot_pinned');
    return saved !== null ? saved === 'true' : false;
  });

  // Resizable Right Side Copilot Pane State
  const [copilotWidth, setCopilotWidth] = useState<number>(() => {
    const saved = localStorage.getItem('juris_copilot_width');
    return saved ? Number(saved) : 450;
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('juris_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light';
  });

  // Keep html class in sync with theme state
  useEffect(() => {
    localStorage.setItem('juris_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Track the .copilotKitHeader DOM node for portal injection
  const [headerEl, setHeaderEl] = useState<Element | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    localStorage.setItem('juris_copilot_width', String(copilotWidth));
  }, [copilotWidth]);

  // Dynamically inject CSS rules for copilot sidebar width
  useEffect(() => {
    const styleId = 'copilot-dynamic-width-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `
      .copilotKitSidebar, .copilotKitSidebar.copilotKitSidebarOpen {
        width: ${copilotWidth}px !important;
        max-width: 85vw !important;
        min-width: 320px !important;
      }
      .copilot-pinned-mode .copilotKitSidebar {
        position: relative !important;
        height: 100vh !important;
      }
      /* Make header a positioning context for the pin button */
      .copilotKitHeader {
        position: relative !important;
        overflow: visible !important;
      }
      /* Hide CopilotKit DevConsole / Inspector icons and overlay buttons */
      .copilotKitDevConsole,
      .copilotKitInspector,
      .copilotKitDevConsoleButton,
      [data-copilotkit-inspector],
      [class*="copilotKitInspector"],
      [class*="copilotKitDevConsole"],
      [class*="CopilotKitInspector"],
      [class*="copilot-inspector"],
      [class*="copilotKitDev"],
      [class*="copilotKitDebug"],
      [id*="copilot-inspector"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* Pin AI icon-only button injected into sidebar header */
      .juris-pin-btn {
        position: absolute !important;
        top: 50% !important;
        right: 44px !important;
        transform: translateY(-50%) !important;
        z-index: 100 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 28px !important;
        height: 28px !important;
        padding: 0 !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        border: 1px solid !important;
        transition: all 0.15s ease !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
      }
    `;
  }, [copilotWidth]);

  // Use a MutationObserver to detect when .copilotKitHeader is mounted in the DOM
  useEffect(() => {
    const findHeader = () => {
      const el = document.querySelector('.copilotKitHeader');
      if (el) {
        setHeaderEl(el);
        return true;
      }
      return false;
    };

    if (!findHeader()) {
      observerRef.current = new MutationObserver(() => {
        if (findHeader()) {
          observerRef.current?.disconnect();
        }
      });
      observerRef.current.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = copilotWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 320), Math.floor(window.innerWidth * 0.85));
      setCopilotWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('juris_gemini_key', newKey);
  };

  const handleSaveAdvocateName = (newName: string) => {
    setAdvocateName(newName);
    localStorage.setItem('juris_advocate_name', newName);
  };

  const handleTogglePinCopilot = () => {
    setIsCopilotPinned((prev) => {
      const next = !prev;
      localStorage.setItem('juris_copilot_pinned', String(next));
      return next;
    });
  };

  // Pin AI icon-only button rendered as a portal directly inside .copilotKitHeader
  const pinButton = (
    <button
      onClick={handleTogglePinCopilot}
      className="juris-pin-btn no-print"
      style={
        isCopilotPinned
          ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.5)' }
          : { background: 'rgba(241,245,249,0.8)', color: '#64748b', borderColor: '#cbd5e1' }
      }
      title={isCopilotPinned ? 'Sidebar Pinned (Click to unpin)' : 'Pin Sidebar (Click to pin)'}
    >
      <Pin
        style={{
          width: '14px',
          height: '14px',
          fill: isCopilotPinned ? '#f59e0b' : 'none',
          color: isCopilotPinned ? '#f59e0b' : '#64748b',
          transform: isCopilotPinned ? 'rotate(45deg)' : 'none',
          flexShrink: 0,
        }}
      />
    </button>
  );

  return (
    <CopilotKit
      runtimeUrl="/api/copilot"
      headers={apiKey ? { 'x-gemini-api-key': apiKey } : {}}
      properties={{ apiKey }}
    >
      <div className={`relative ${isCopilotPinned ? 'copilot-pinned-mode' : ''}`}>
        {/* Draggable Resize Handle for Copilot Right Side Pane */}
        <div
          onMouseDown={handleMouseDownResize}
          className="no-print fixed top-0 bottom-0 z-50 w-3 cursor-col-resize hover:bg-indigo-500/40 transition-colors group flex items-center justify-center"
          style={{ right: `${copilotWidth - 6}px` }}
          title="Drag left/right to adjust Legal AI Copilot pane width"
        >
          <div className="w-1 h-12 rounded-full bg-slate-600/80 group-hover:bg-indigo-300 group-active:bg-indigo-400 shadow-sm" />
        </div>

        <CopilotSidebar
          defaultOpen={false}
          clickOutsideToClose={!isCopilotPinned}
          labels={{
            title: '🏛️ Legal AI Copilot',
            initial: apiKey
              ? `👋 Hello Advocate! I am **JurisCopilot** — your AI-powered legal drafting assistant.\n\n**I can help you:**\n\u2022 **Draft & edit** clauses, petitions, affidavits in Marathi & English\n\u2022 **Fill client details** from your raw interview notes\n\u2022 **Translate** documents between Marathi ↔ English\n\u2022 **Audit** statutory compliance (Bombay HC guidelines)\n\u2022 **Insert** standard clauses (alimony waiver, custody, NDA, etc.)\n\nJust type your instruction or click a suggestion below!`
              : `⚙️ **Gemini API Key not configured.**\n\nTo enable the AI Legal Copilot:\n1. Click **Settings (⚙️)** in the top toolbar\n2. Enter your free Gemini API key from [aistudio.google.com](https://aistudio.google.com/apikey)\n3. Click **Save** — AI Copilot activates instantly\n\nThe **free tier** includes gemini-2.0-flash with 1M token context, sufficient for all legal drafting tasks.`,
          }}
        >
          <LegalWorkspace
            apiKey={apiKey}
            onSaveApiKey={handleSaveApiKey}
            advocateName={advocateName}
            onSaveAdvocateName={handleSaveAdvocateName}
            isCopilotPinned={isCopilotPinned}
            onTogglePinCopilot={handleTogglePinCopilot}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />
        </CopilotSidebar>

        {/* Portal: inject Pin AI button directly inside .copilotKitHeader */}
        {headerEl && ReactDOM.createPortal(pinButton, headerEl)}
      </div>
    </CopilotKit>
  );
}
