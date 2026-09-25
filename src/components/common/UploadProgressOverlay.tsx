import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, UploadCloud, XCircle, ArrowRight } from 'lucide-react';
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
    <div className="fixed bottom-20 left-3 right-3 z-[160] mx-auto max-w-lg space-y-2 pointer-events-none animate-in fade-in slide-in-from-bottom-3">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="pointer-events-auto rounded-2xl border border-border/80 bg-background/95 p-3 shadow-2xl backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            {job.thumbnailUrl ? (
              <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-border/80 bg-zinc-900 shadow">
                <img src={job.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                  {job.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 drop-shadow" />
                  ) : job.status === 'error' ? (
                    <XCircle className="h-5 w-5 text-destructive drop-shadow" />
                  ) : (
                    <UploadCloud className="h-5 w-5 text-white drop-shadow animate-pulse" />
                  )}
                </div>
              </div>
            ) : (
              job.status === 'complete' ? (
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
              ) : job.status === 'error' ? (
                <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UploadCloud className="h-6 w-6 text-primary animate-pulse" />
                </div>
              )
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-xs font-bold text-foreground tracking-tight">{job.label}</p>
                {job.status === 'uploading' && (
                  <span className="flex items-center gap-1 text-xs font-black tabular-nums text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {job.progress}%
                  </span>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {job.status === 'complete'
                  ? 'Upload complete 🎉'
                  : job.status === 'error'
                    ? job.error || 'Upload fail hua'
                    : `${job.progress}% • Website me rahein, background me upload ho raha hai`}
              </p>
            </div>
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${
                job.status === 'error'
                  ? 'bg-destructive'
                  : 'bg-gradient-to-r from-[hsl(var(--p1))] to-[hsl(var(--p2))]'
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
