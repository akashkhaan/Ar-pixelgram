import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, UploadCloud, X, Film, Image as ImageIcon } from 'lucide-react';
import {
  getUploadJobs,
  subscribeToUploads,
  dismissUpload,
  type UploadJob,
} from '@/services/uploadManager';

const UploadProgressOverlay: React.FC = () => {
  const [jobs, setJobs] = useState<UploadJob[]>(getUploadJobs());

  useEffect(() => subscribeToUploads(setJobs), []);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed top-3 left-3 right-3 z-[250] mx-auto max-w-md space-y-2 pointer-events-none animate-in fade-in slide-in-from-top-3">
      {jobs.map((job) => {
        const isDone = job.status === 'complete';
        const isErr = job.status === 'error';
        const percent = isDone ? 100 : Math.max(1, Math.min(100, Math.round(job.progress)));

        return (
          <div
            key={job.id}
            className="pointer-events-auto rounded-2xl border border-white/20 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl text-white transition-all"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              {/* Thumbnail / Icon */}
              <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-white/10 bg-zinc-900 shadow flex items-center justify-center">
                {job.thumbnailUrl ? (
                  <img src={job.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : job.kind === 'reel' || job.kind === 'video' ? (
                  <Film className="h-5 w-5 text-primary" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-primary" />
                )}

                {isDone && (
                  <div className="absolute inset-0 bg-emerald-600/90 flex items-center justify-center animate-in zoom-in-75">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>

              {/* Progress Labels */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-bold text-white tracking-tight">
                    {job.label}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isDone && !isErr && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    )}
                    <span className="text-xs font-black tabular-nums text-primary">
                      {isDone ? '100%' : `${percent}%`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-0.5">
                  <span className="truncate">
                    {isDone
                      ? 'Upload complete 🎉'
                      : isErr
                      ? job.error || 'Upload fail hua'
                      : `Uploading… ${percent}% (1 se 100% processing)`}
                  </span>
                </div>
              </div>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => dismissUpload(job.id)}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white shrink-0 active:scale-90 transition-transform"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Glowing Progress bar: 1% to 100% */}
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-200 ease-out ${
                  isErr
                    ? 'bg-destructive'
                    : isDone
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UploadProgressOverlay;
