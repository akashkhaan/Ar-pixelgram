import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Youtube,
  Instagram,
  Facebook,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Checks whether a URL is a major platform that blocks iframe embedding via X-Frame-Options
 */
export function isIframeBlockedUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('instagram.com') ||
    lower.includes('facebook.com') ||
    lower.includes('fb.com') ||
    lower.includes('fb.me') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('linkedin.com') ||
    lower.includes('tiktok.com') ||
    lower.includes('threads.net') ||
    lower.includes('t.me')
  );
}

/**
 * Dispatches a global event or directly opens URLs.
 * For social apps that strictly block iframes, opens directly in a new tab/app to prevent Chrome's broken document screen.
 */
export function openInAppBrowser(rawUrl: string, title?: string) {
  if (!rawUrl || !rawUrl.trim()) return;
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // If it's a major social app, open directly in the browser / native app so the user never gets a blocked iframe
  if (isIframeBlockedUrl(url)) {
    try {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.href = url;
      }
    } catch {
      window.location.href = url;
    }
    return;
  }

  // For general websites that support embedding, open In-App Browser
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
        const url = customEvent.detail.url;
        setCurrentUrl(url);
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

  const isSocial = isIframeBlockedUrl(currentUrl);

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
          {!isSocial && (
            <button
              type="button"
              onClick={handleReload}
              className="p-2 rounded-full hover:text-foreground hover:bg-muted transition-colors"
              title="Refresh"
              aria-label="Refresh"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
            </button>
          )}
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
      {isLoading && !isSocial && (
        <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
          <div className="h-full bg-primary animate-pulse w-3/4" />
        </div>
      )}

      {/* Webview or Native Card Content */}
      <div className="flex-1 w-full h-full relative bg-card overflow-hidden">
        {isSocial ? (
          // Branded Card for Social Platforms (replaces broken iframe)
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 shadow-md">
              {currentUrl.includes('youtube') ? (
                <Youtube className="w-8 h-8 text-red-500" />
              ) : currentUrl.includes('instagram') ? (
                <Instagram className="w-8 h-8 text-pink-500" />
              ) : currentUrl.includes('facebook') ? (
                <Facebook className="w-8 h-8 text-blue-600" />
              ) : (
                <Globe className="w-8 h-8 text-primary" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">
                {displayTitle || host}
              </h3>
              <p className="text-xs text-muted-foreground break-all max-w-xs mx-auto">
                {currentUrl}
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenExternal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-primary hover:bg-primary/90 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in App / Browser</span>
            </button>
          </div>
        ) : (
          <>
            <iframe
              key={iframeKey}
              src={currentUrl}
              title={displayTitle || 'Pixelgram In-App Browser'}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setIsLoading(false)}
            />

            {/* Fallback assistance banner */}
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
          </>
        )}
      </div>
    </div>
  );
};

export default InAppBrowserModal;
