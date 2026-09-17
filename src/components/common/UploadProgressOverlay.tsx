import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react';
import {
  getUploadJobs,
  subscribeToUploads,
  type UploadJob,
} from '@/services/uploadManager';

const UploadProgressOverlay: React.FC = () => {
  const [jobs, setJobs] = useState<UploadJob[]>(getUploadJobs());

  useEffect(() => subscribeToUploads(setJobs), []);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[160] mx-auto max-w-lg space-y-2 pointer-events-none">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="pointer-events-auto rounded-2xl border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            {job.status === 'complete' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : job.status === 'error' ? (
              <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <UploadCloud className="h-5 w-5 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{job.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {job.status === 'complete'
                  ? 'Upload complete'
                  : job.status === 'error'
                    ? job.error || 'Upload fail hua'
                    : `${job.progress}% — screen change kar sakte hain`}
              </p>
            </div>
            {job.status === 'uploading' && (
              <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {job.progress}%
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                job.status === 'error' ? 'bg-destructive' : 'bg-gradient-to-r from-[hsl(var(--p1))] to-[hsl(var(--p2))]'
              }`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default UploadProgressOverlay;