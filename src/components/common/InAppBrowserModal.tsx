import React, { useState, useEffect } from 'react';
import { X, Lock, RotateCw, Copy, Check, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Dispatches a global event to open any URL in the built-in In-App Browser
 */
export function openInAppBrowser(rawUrl: string, title?: string) {
  if (!rawUrl || !rawUrl.trim()) return;
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  window.dispatchEvent(
    new CustomEvent('open-in-app-browser', {
      detail: { url, title: title || '' },
    })
  );
}

export const InAppBrowserModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string; title?: string }>;
      if (customEvent.detail?.url) {
        setCurrentUrl(customEvent.detail.url);
        setDisplayTitle(customEvent.detail.title || '');
        setIsLoading(true);
        setIframeKey((prev) => prev + 1);
        setIsOpen(true);
      }
    };

    window.addEventListener('open-in-app-browser', handleOpen);
    return () => {
      window.removeEventListener('open-in-app-browser', handleOpen);
    };
  }, []);

  if (!isOpen || !currentUrl) return null;

  let host = '';
  try {
    host = new URL(currentUrl).hostname.replace(/^www\./, '');
  } catch {
    host = currentUrl;
  }

  const handleClose = () => {
    setIsOpen(false);
    setCurrentUrl('');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    try {
      window.open(currentUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = currentUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Top Browser Bar (Instagram Style) */}
      <header className="h-14 px-3 flex items-center justify-between border-b border-border bg-card shrink-0 select-none">
        <button
          type="button"
          onClick={handleClose}
          className="p-2 -ml-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
          title="Close browser"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* URL / Domain center pill */}
        <div className="flex-1 mx-2 flex flex-col items-center justify-center min-w-0">
          <div className="flex items-center gap-1.5 max-w-[220px] truncate">
            <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold truncate text-foreground">
              {displayTitle || host}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground truncate max-w-[220px]">
            {currentUrl}
          </span>
        </div>

        {/* Actions on right */}
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            onClick={handleReload}
            className="p-2 rounded-full hover:text-foreground hover:bg-muted transition-colors"
            title="Refresh"
            aria-label="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-full hover:text-foreground hover:bg-muted transition-colors"
            title="Copy URL"
            aria-label="Copy URL"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-2 rounded-full hover:text-foreground hover:bg-muted transition-colors"
            title="Open externally"
            aria-label="Open externally"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Loading Progress Bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
          <div className="h-full bg-primary animate-pulse w-3/4" />
        </div>
      )}

      {/* Webview Content */}
      <div className="flex-1 w-full h-full relative bg-card overflow-hidden">
        <iframe
          key={iframeKey}
          src={currentUrl}
          title={displayTitle || 'Pixelgram In-App Browser'}
          className="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setIsLoading(false)}
        />

        {/* Fallback assistance banner (if site disallows iframe embedding like x.com/login) */}
        <div className="absolute bottom-2 left-3 right-3 py-2 px-3 bg-background/90 backdrop-blur-md rounded-xl border border-border/80 flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <Globe className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate text-muted-foreground text-[11px]">
              In-App Browser · {host}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="text-[11px] font-semibold text-primary hover:underline shrink-0"
          >
            Open in Browser
          </button>
        </div>
      </div>
    </div>
  );
};

export default InAppBrowserModal;
