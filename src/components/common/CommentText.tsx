import React from 'react';
import { openInAppBrowser } from './InAppBrowserModal';

interface CommentTextProps {
  text?: string | null;
  className?: string;
}

export const CommentText: React.FC<CommentTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Split by URLs (http, https, www., or popular social domains)
  const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-zA-Z0-9-]+\.)+(?:com|in|org|net|io|me|app|ai|dev|co)(?:\/[^\s<]*)?)/gi;
  const parts = text.split(urlRegex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        // Check if this part is a URL
        if (/^(?:https?:\/\/|www\.)/i.test(part) || /(?:[a-zA-Z0-9-]+\.)+(?:com|in|org|net|io|me|app|ai|dev|co)/i.test(part)) {
          // Remove trailing punctuation
          let cleanUrl = part;
          let trailing = '';
          const match = part.match(/([.,;:!?)]+)$/);
          if (match) {
            trailing = match[1];
            cleanUrl = part.slice(0, -trailing.length);
          }

          const targetUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

          return (
            <React.Fragment key={index}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  openInAppBrowser(targetUrl);
                }}
                className="text-blue-500 dark:text-blue-400 font-medium hover:underline break-all inline cursor-pointer text-left transition-colors"
                title={`Open ${cleanUrl} in In-App Browser`}
              >
                {cleanUrl}
              </button>
              {trailing}
            </React.Fragment>
          );
        }

        // Hashtags
        const hashtagRegex = /(#[a-zA-Z0-9_\u0900-\u097F]+)/g;
        if (hashtagRegex.test(part)) {
          const subParts = part.split(hashtagRegex);
          return (
            <React.Fragment key={index}>
              {subParts.map((sub, sIdx) => {
                if (sub.startsWith('#')) {
                  return (
                    <span
                      key={sIdx}
                      className="text-primary font-medium hover:underline cursor-pointer"
                    >
                      {sub}
                    </span>
                  );
                }
                return sub;
              })}
            </React.Fragment>
          );
        }

        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};

export default CommentText;
