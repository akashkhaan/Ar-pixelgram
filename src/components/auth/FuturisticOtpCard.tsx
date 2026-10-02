import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ArrowLeft, Sun, Moon } from 'lucide-react';

export interface FuturisticOtpCardProps {
  title?: string;
  subtitle?: string;
  target?: string;
  type?: 'email' | 'phone';
  length?: number;
  onVerify: (otp: string) => Promise<boolean | void>;
  onResend?: () => Promise<void> | void;
  onBack?: () => void;
  successTitle?: string;
  successSubtitle?: string;
}

export const FuturisticOtpCard: React.FC<FuturisticOtpCardProps> = ({
  title = 'Check Your Email Now',
  subtitle = 'Enter the OTP sent to your email.',
  target = '',
  type = 'email',
  length = 6,
  onVerify,
  onResend,
  onBack,
  successTitle = 'Your Account Verified Successfully',
  successSubtitle = 'Welcome back. Redirecting...',
}) => {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [verifyPercent, setVerifyPercent] = useState<number>(0);

  // 60-second countdown timer
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  // Refs for 3D card tilt & canvas particles
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Start / restart timer
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(60);
    setIsExpired(false);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  // Focus first input on mount
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Background Particles Canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let animId: number;
    let W = (cv.width = window.innerWidth);
    let H = (cv.height = window.innerHeight);

    const onResize = () => {
      if (!cv) return;
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const P = Array.from({ length: Math.min(60, Math.floor(W / 15)) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.4,
      v: Math.random() * 0.3 + 0.08,
      a: Math.random() * 0.6 + 0.2,
    }));

    const render = () => {
      cx.clearRect(0, 0, W, H);
      P.forEach((p) => {
        p.y -= p.v;
        if (p.y < -5) {
          p.y = H + 5;
          p.x = Math.random() * W;
        }
        cx.beginPath();
        cx.fillStyle = `rgba(196, 181, 253, ${p.a})`;
        cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        cx.fill();
      });
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // 3D Tilt on Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.transform = `rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 12}deg)`;
  };

  const handleMouseLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = 'rotateY(0deg) rotateX(0deg)';
    }
  };

  // Digit Input Handler
  const handleDigitChange = (idx: number, val: string) => {
    // Only accept numeric digits
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }

    // Handle pasting multi digits
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, length).split('');
      const next = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        if (idx + i < length) next[idx + i] = pasted[i];
      }
      setDigits(next);
      const nextFocus = Math.min(idx + pasted.length, length - 1);
      setActiveIdx(nextFocus);
      inputsRef.current[nextFocus]?.focus();

      if (next.every((d) => d !== '')) {
        verifyOtp(next.join(''));
      }
      return;
    }

    const next = [...digits];
    next[idx] = cleaned[cleaned.length - 1];
    setDigits(next);
    setErrorMessage('');

    // Advance to next box
    if (idx < length - 1) {
      setActiveIdx(idx + 1);
      inputsRef.current[idx + 1]?.focus();
    }

    // If all digits entered, trigger verification automatically!
    if (next.every((d) => d !== '')) {
      verifyOtp(next.join(''));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        const next = [...digits];
        next[idx - 1] = '';
        setDigits(next);
        setActiveIdx(idx - 1);
        inputsRef.current[idx - 1]?.focus();
      } else {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      }
      setErrorMessage('');
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      setActiveIdx(idx - 1);
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      setActiveIdx(idx + 1);
      inputsRef.current[idx + 1]?.focus();
    } else if (e.key === 'Enter') {
      const full = digits.join('');
      if (full.length === length) {
        verifyOtp(full);
      }
    }
  };

  // Real OTP Verification
  const verifyOtp = async (codeToVerify: string) => {
    if (status === 'verifying' || status === 'success') return;

    if (codeToVerify.length !== length) {
      setErrorMessage('Kripya 6-digit code poora daalein');
      return;
    }

    if (isExpired || timeLeft <= 0) {
      setErrorMessage('⚠️ OTP 1 minute me expire ho gaya hai. Resend par tap karein.');
      return;
    }

    setStatus('verifying');
    setErrorMessage('');
    setVerifyPercent(15);

    // Percentage progress animation
    const progressInterval = setInterval(() => {
      setVerifyPercent((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 150);

    try {
      const result = await onVerify(codeToVerify);

      // If onVerify returns false, treat as failed verification
      if (result === false) {
        throw new Error('Galat OTP code! Kripya sahi code daalein.');
      }

      clearInterval(progressInterval);
      setVerifyPercent(100);
      setStatus('success');
    } catch (err: any) {
      clearInterval(progressInterval);
      setStatus('error');
      setErrorMessage(err?.message || 'Galat OTP code! Kripya sahi code daalein.');

      // Clear input boxes after error so user can re-type
      setTimeout(() => {
        setDigits(Array(length).fill(''));
        setActiveIdx(0);
        inputsRef.current[0]?.focus();
        setStatus('idle');
      }, 1200);
    }
  };

  const handleResend = async () => {
    if (onResend) {
      try {
        await onResend();
      } catch (e) {
        console.warn('Resend error:', e);
      }
    }
    setDigits(Array(length).fill(''));
    setActiveIdx(0);
    setErrorMessage('');
    setStatus('idle');
    startTimer();
    inputsRef.current[0]?.focus();
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden select-none bg-[radial-gradient(120%_90%_at_50%_0%,#1a163a,#090814_70%)] font-sans text-slate-100">
      {/* Canvas Particles */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />

      {/* Floating Glowing Blobs */}
      <div className="fixed w-[380px] h-[380px] rounded-full bg-violet-600/40 blur-[90px] -top-28 -left-24 pointer-events-none animate-pulse" />
      <div className="fixed w-[340px] h-[340px] rounded-full bg-indigo-500/30 blur-[90px] -bottom-28 -right-20 pointer-events-none animate-pulse" />
      <div className="fixed w-[240px] h-[240px] rounded-full bg-purple-500/25 blur-[80px] top-1/2 left-2/3 pointer-events-none" />

      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="fixed top-4 left-4 z-20 w-10 h-10 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:scale-105 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Main 3D Card with Conic Rotating Border */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`relative z-10 w-full max-w-[360px] min-h-[440px] p-[1.5px] rounded-[30px] overflow-hidden transition-all duration-300 shadow-[0_40px_90px_rgba(0,0,0,0.55),0_0_70px_-10px_rgba(139,123,255,0.55)] ${
          status === 'success' ? 'shadow-[0_0_80px_rgba(16,185,129,0.65)]' : ''
        }`}
        style={{ perspective: 1200 }}
      >
        {/* Rotating Conic Gradient Border */}
        <div
          className={`absolute left-1/2 top-1/2 w-[240%] aspect-square -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-500 ${
            status === 'success'
              ? 'bg-[conic-gradient(from_0deg,transparent_0_55%,#10b981_75%,#6ee7b7_88%,transparent_100%)] animate-[spin_1.4s_linear_infinite]'
              : 'bg-[conic-gradient(from_0deg,transparent_0_55%,#8b7bff_75%,#f5d98b_88%,transparent_100%)] animate-[spin_1.4s_linear_infinite]'
          }`}
        />

        {/* Card Inner Body */}
        <div className="relative w-full h-full min-h-[436px] rounded-[28.5px] bg-[#100f24]/95 backdrop-blur-xl p-6 text-center overflow-hidden flex flex-col items-center justify-between">
          
          {/* Top Floating Glowing Icon */}
          <div className="relative mt-2">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 relative overflow-hidden ${
                status === 'success'
                  ? 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-800 shadow-[0_10px_26px_rgba(16,185,129,0.5)]'
                  : 'bg-gradient-to-br from-indigo-300 via-indigo-600 to-violet-900 shadow-[0_10px_26px_rgba(139,123,255,0.5)]'
              }`}
            >
              {type === 'phone' ? (
                <svg className="w-6 h-6 text-white stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="4.5" y="10.5" width="15" height="10" rx="3" strokeWidth="2.2" />
                  <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" strokeWidth="2.2" />
                  <circle cx="12" cy="15.5" r="1" fill="#fff" />
                </svg>
              )}
            </div>

            {/* Pulsing Halo */}
            <div
              className={`absolute inset-0 rounded-2xl border-2 pointer-events-none animate-ping opacity-30 ${
                status === 'success' ? 'border-emerald-400' : 'border-indigo-400'
              }`}
            />
          </div>

          {/* Heading with Animated Gradient Text */}
          <div className="mt-4 mb-2">
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-indigo-200 to-white bg-clip-text text-transparent animate-pulse">
              {status === 'success'
                ? successTitle
                : status === 'verifying'
                ? 'Verify Your Account'
                : title}
            </h1>
            <p className="text-xs text-indigo-200/60 mt-1 max-w-[280px] mx-auto leading-relaxed">
              {status === 'success'
                ? successSubtitle
                : status === 'verifying'
                ? 'Securely checking your credentials...'
                : target
                ? `Enter the 6-digit OTP sent to ${target}`
                : subtitle}
            </p>
          </div>

          {/* Center Stage: Interactive Real 6-Box Inputs or Verification Spinner or Success Orb */}
          <div className="relative w-full h-[140px] flex items-center justify-center my-1">
            {/* STAGE A: 6-DIGIT INTERACTIVE INPUTS (Real Interactive Typing!) */}
            {status !== 'verifying' && status !== 'success' && (
              <div
                className={`flex items-center justify-center gap-2.5 transition-all duration-300 ${
                  status === 'error' ? 'animate-[shake_0.4s_ease-in-out]' : ''
                }`}
              >
                {digits.map((digit, idx) => {
                  const isAct = activeIdx === idx;
                  const isFull = Boolean(digit);
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setActiveIdx(idx);
                        inputsRef.current[idx]?.focus();
                      }}
                      className={`relative w-[44px] h-[52px] rounded-[13px] border flex items-center justify-center text-[22px] font-black cursor-text transition-all duration-200 backdrop-blur-md select-none ${
                        isAct
                          ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_0_4px_rgba(139,123,255,0.25),0_0_26px_rgba(139,123,255,0.6)]'
                          : isFull
                          ? 'border-indigo-400/70 bg-gradient-to-b from-indigo-500/25 to-indigo-500/10 shadow-[0_8px_24px_rgba(139,123,255,0.3)]'
                          : 'border-white/15 bg-white/5 hover:border-white/30'
                      } ${status === 'error' ? '!border-rose-500 !bg-rose-500/20 !shadow-[0_0_20px_rgba(244,63,94,0.5)]' : ''}`}
                    >
                      {/* Hidden actual input */}
                      <input
                        ref={(el) => (inputsRef.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        onFocus={() => setActiveIdx(idx)}
                        className="absolute inset-0 opacity-0 cursor-text w-full h-full text-center"
                      />

                      {/* Displayed Digit with Gradient Text */}
                      {digit ? (
                        <span className="bg-gradient-to-b from-white to-indigo-200 bg-clip-text text-transparent">
                          {digit}
                        </span>
                      ) : isAct ? (
                        /* Glowing cursor blink */
                        <div className="w-[2px] h-[26px] rounded-full bg-indigo-300 shadow-[0_0_8px_#8b7bff] animate-[pulse_1s_infinite]" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {/* STAGE B: VERIFYING CIRCULAR RING SPINNER */}
            {status === 'verifying' && (
              <div className="relative w-24 h-24 flex items-center justify-center animate-in zoom-in-75 duration-300">
                <div className="absolute inset-0 rounded-full border border-indigo-500/40 shadow-[0_0_36px_rgba(139,123,255,0.6),inset_0_0_22px_rgba(139,123,255,0.25)] animate-pulse" />
                <svg className="w-20 h-20 -rotate-90 animate-[spin_2s_linear_infinite]" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(139,123,255,0.16)" strokeWidth="3.5" />
                  <circle
                    cx="36"
                    cy="36"
                    r="33"
                    fill="none"
                    stroke="#c4b5fd"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray="207.3"
                    strokeDashoffset={207.3 * (1 - verifyPercent / 100)}
                    className="transition-all duration-200"
                  />
                </svg>
                <div className="absolute inset-5 rounded-full bg-indigo-950/80 shadow-inner flex items-center justify-center font-black text-sm text-white">
                  {verifyPercent}%
                </div>
              </div>
            )}

            {/* STAGE C: SUCCESS ORB & VERIFIED BADGE */}
            {status === 'success' && (
              <div className="relative flex flex-col items-center justify-center animate-in zoom-in-75 duration-500">
                {/* Expanding green ripple */}
                <div className="absolute w-20 h-20 rounded-full border-2 border-emerald-400 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite] opacity-60" />

                {/* Glowing Orb with Checkmark */}
                <div className="w-20 h-20 rounded-full bg-radial from-emerald-300 via-emerald-500 to-teal-900 shadow-[0_0_40px_10px_rgba(16,185,129,0.6)] flex items-center justify-center">
                  <svg className="w-10 h-10 text-white stroke-[3.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                </div>

                {/* VERIFIED Pill */}
                <div className="mt-3 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 text-[#04251a] font-extrabold text-[11px] tracking-widest shadow-[0_8px_20px_rgba(16,185,129,0.5)] animate-bounce">
                  VERIFIED
                </div>
              </div>
            )}
          </div>

          {/* Error Message if wrong OTP */}
          {errorMessage && (
            <p className="text-xs font-semibold text-rose-400 mt-1 animate-pulse">
              {errorMessage}
            </p>
          )}

          {/* Submit / Verify Button */}
          {status !== 'success' && (
            <button
              type="button"
              onClick={() => verifyOtp(digits.join(''))}
              disabled={status === 'verifying' || digits.some((d) => !d) || isExpired}
              className={`w-full h-11 mt-3 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-md active:scale-98 flex items-center justify-center ${
                status === 'verifying' || digits.some((d) => !d) || isExpired
                  ? 'bg-white/10 text-white/40 cursor-not-allowed border border-white/10'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:brightness-110 shadow-[0_4px_20px_rgba(139,123,255,0.4)] cursor-pointer'
              }`}
            >
              {status === 'verifying' ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                'Verify Security Code'
              )}
            </button>
          )}

          {/* Footer: Countdown Timer & Resend Link */}
          <div className="mt-3 text-xs text-indigo-200/60 flex items-center justify-center gap-2">
            {isExpired ? (
              <span className="text-rose-400 font-semibold">Code expired</span>
            ) : (
              <span>Expires in: <b className="text-indigo-300">00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</b></span>
            )}
            <span>•</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={status === 'verifying'}
              className="font-bold text-indigo-300 hover:text-white hover:underline cursor-pointer transition-colors"
            >
              Resend Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuturisticOtpCard;
