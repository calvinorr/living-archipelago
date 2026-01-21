'use client';

import { useState, useEffect } from 'react';
import { GitBranch } from 'lucide-react';

const COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT || 'dev';
const BRANCH = process.env.NEXT_PUBLIC_GIT_BRANCH || 'unknown';
const BUILD_TIME = parseInt(process.env.NEXT_PUBLIC_BUILD_TIME || '0', 10);

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function VersionBadge() {
  const [relativeTime, setRelativeTime] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRelativeTime(formatRelativeTime(BUILD_TIME));

    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(BUILD_TIME));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(COMMIT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-colors"
      title={`Branch: ${BRANCH}\nCommit: ${COMMIT}\nClick to copy commit hash`}
    >
      <GitBranch className="w-3 h-3" />
      <span className="font-medium">{BRANCH}</span>
      <span className="text-muted-foreground/70">@</span>
      <code className="font-mono">{copied ? 'copied!' : COMMIT}</code>
      {relativeTime && (
        <>
          <span className="text-muted-foreground/50">•</span>
          <span className="text-muted-foreground/70">{relativeTime}</span>
        </>
      )}
    </button>
  );
}
