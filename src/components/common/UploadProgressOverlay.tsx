import React, { useEffect, useState } from 'react';
import {
  getUploadJobs,
  subscribeToUploads,
  dismissUpload,
  type UploadJob,
} from '@/services/uploadManager';
import './uploadCard.css';

const UploadProgressOverlay: React.FC = () => {
  const [jobs, setJobs] = useState<UploadJob[]>(getUploadJobs());

  useEffect(() => subscribeToUploads(setJobs), []);

  if (jobs.length === 0) return null;

  return (
    <div className="pxu-wrap">
      {jobs.map((job) => {
        const isDone = job.status === 'complete';
        const isErr = job.status === 'error';
        const p = isDone ? 100 : Math.round(Math.max(0, Math.min(100, job.progress)));
        const sub = isDone
          ? 'Upload complete'
          : isErr
          ? job.error || 'Upload fail hua'
          : p < 99
          ? `Uploading… ${p}%`
          : `Uploading… ${p}% (1 se 100% processing)`;

        return (
          <div key={job.id} className="pxu" role="status" aria-live="polite">
            <div className={`pxu-fill${isErr ? ' err' : ''}`} style={{ width: `${p}%` }} />
            <div className="pxu-top">
              <div className="pxu-ico">
                {job.thumbnailUrl && job.thumbnailType === 'video' ? (
                  <video src={job.thumbnailUrl} autoPlay muted loop playsInline />
                ) : job.thumbnailUrl ? (
                  <img src={job.thumbnailUrl} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="9" cy="9" r="1.8" /><path d="m21 15-5-5L5 21" /></svg>
                )}
              </div>
              <div className="pxu-mid">
                <b>{job.label}</b>
                <span>{sub}</span>
              </div>
              <div className="pxu-side">
                <div className="pxu-pct">{p}%</div>
                <button type="button" className="pxu-x" aria-label="Cancel" onClick={() => dismissUpload(job.id)}>
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UploadProgressOverlay;
