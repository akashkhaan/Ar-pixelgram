import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUploadJobs,
  subscribeToUploads,
  dismissUpload,
  type UploadJob,
} from "@/services/uploadManager";
import "./uploadCard.css";

const UploadProgressOverlay: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<UploadJob[]>(getUploadJobs());
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeToUploads(setJobs), []);

  // Timer tick every 200ms to smoothly transition at exactly 10s
  useEffect(() => {
    if (jobs.length === 0) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => clearInterval(interval);
  }, [jobs.length]);

  if (jobs.length === 0) return null;

  return (
    <div className="pxu-wrap">
      {jobs.map((job) => {
        const isDone = job.status === "complete";
        const isErr = job.status === "error";
        const p = isDone ? 100 : Math.round(Math.max(0, Math.min(100, job.progress)));

        const startTime = job.startedAt || now;
        const elapsed = now - startTime;

        // After 10s on screen + 1s flight animation (11s total), hide top popup
        // The upload continues actively in background and shows inside the Profile page!
        if (!isErr && !isDone && elapsed >= 11000) {
          return null;
        }

        const isFlying = !isErr && !isDone && elapsed >= 10000;

        const sub = isDone
          ? "Upload complete! 🎉"
          : isErr
          ? job.error || "Upload fail hua"
          : p < 99
          ? `Uploading… ${p}% (Profile me dekhein)`
          : `Processing… ${p}%`;

        return (
          <div
            key={job.id}
            className={`pxu ${isFlying ? "pxu-fly-to-profile" : ""}`}
            role="status"
            aria-live="polite"
            onClick={() => {
              if (!isFlying) navigate("/profile");
            }}
            style={{ cursor: isFlying ? "default" : "pointer" }}
            title="Profile me dekhne ke liye tap karein"
          >
            <div className={`pxu-fill${isErr ? " err" : ""}`} style={{ width: `${p}%` }} />
            <div className="pxu-top">
              <div className="pxu-ico">
                {job.thumbnailUrl && job.thumbnailType === "video" ? (
                  <video src={job.thumbnailUrl} autoPlay muted loop playsInline />
                ) : job.thumbnailUrl ? (
                  <img src={job.thumbnailUrl} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="9" cy="9" r="1.8" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                )}
              </div>
              <div className="pxu-mid">
                <b>{job.label}</b>
                <span>{sub}</span>
              </div>
              <div className="pxu-side">
                <div className="pxu-pct">{p}%</div>
                <button
                  type="button"
                  className="pxu-x"
                  aria-label="Cancel"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissUpload(job.id);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
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
