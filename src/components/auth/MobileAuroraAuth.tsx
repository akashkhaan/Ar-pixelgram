import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";
import { saveCurrentAccount } from "@/lib/savedAccounts";
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { getProfile, updateProfile } from '@/services/api';
import { withTimeout } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface MobileAuroraAuthProps {
  initialMode?: 'login' | 'register';
}

export const MobileAuroraAuth: React.FC<MobileAuroraAuthProps> = ({ initialMode = 'login' }) => {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'register');
  const navigate = useNavigate();

  // Login form state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginShowPass, setLoginShowPass] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Register form state
  const [regFirst, setRegFirst] = useState('');
  const [regLast, setRegLast] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regContact, setRegContact] = useState('');
  const [contactMode, setContactMode] = useState<'email' | 'phone'>('email');
  const [regPass, setRegPass] = useState('');
  const [regShowPass, setRegShowPass] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Canvas floating glowing particles
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let animId: number;
    let W = (cv.width = cv.offsetWidth || 340);
    let H = (cv.height = cv.offsetHeight || 540);

    const count = Math.max(16, Math.round(W / 24));
    const dots = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1 + Math.random() * 2.8,
      v: 0.25 + Math.random() * 0.6,
      p: Math.random() * 6.28,
      a: 0.25 + Math.random() * 0.55,
    }));

    const resize = () => {
      if (!cv) return;
      W = cv.width = cv.offsetWidth || 340;
      H = cv.height = cv.offsetHeight || 540;
    };
    window.addEventListener('resize', resize);

    const loop = (t: number) => {
      cx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.y -= d.v;
        if (d.y < -10) {
          d.y = H + 10;
          d.x = Math.random() * W;
        }
        const x = d.x + Math.sin(t / 900 + d.p) * 12;
        cx.beginPath();
        cx.arc(x, d.y, d.r, 0, 6.28);
        cx.fillStyle = 'rgba(255, 255, 255, ' + d.a + ')';
        cx.shadowColor = '#fff';
        cx.shadowBlur = 8;
        cx.fill();
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      toast.error('Please fill all fields');
      return;
    }
    setLoginLoading(true);

    let data: Awaited<ReturnType<typeof supabase.auth.getUser>>['data'] | null = null;
    let loginError: string | null = null;

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('login-with-identifier', {
        body: { identifier: loginUser.trim(), password: loginPass },
      });
      if (fnError || fnData?.error) {
        loginError = fnData?.error || 'Invalid login credentials';
      } else if (fnData?.access_token && fnData?.refresh_token) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: fnData.access_token,
          refresh_token: fnData.refresh_token,
        });
        if (sessionError) loginError = sessionError.message;
        else data = { user: sessionData.user };
      } else {
        loginError = 'Invalid login credentials';
      }
    } catch {
      loginError = null;
    }

    if (!data?.user && !loginError && loginUser.includes('@')) {
      const res = await supabase.auth.signInWithPassword({ email: loginUser.trim(), password: loginPass });
      if (res.error) loginError = res.error.message;
      else data = { user: res.data.user };
    }

    if (!data?.user && !loginError) loginError = 'Invalid login credentials';

    if (loginError) {
      setLoginLoading(false);
      if (loginError.toLowerCase().includes('invalid')) {
        toast.error("Wrong username/email/phone or password. If you don't have an account, please Sign Up first.");
      } else {
        toast.error(loginError);
      }
      return;
    }

    if (data?.user) {
      let profile: Awaited<ReturnType<typeof getProfile>> = null;
      let profileFetchFailed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          profile = await withTimeout(getProfile(data.user.id), 15000);
          profileFetchFailed = false;
          if (profile) break;
        } catch (err) {
          console.error('getProfile failed during login', err);
          profileFetchFailed = true;
        }
        if (attempt < 2) await new Promise((res) => setTimeout(res, 600));
      }

      if (profile && profile.account_status === 'permanently_disabled') {
        await supabase.auth.signOut();
        setLoginLoading(false);
        navigate('/account-deleted');
        return;
      }

      if (!profile) {
        setLoginLoading(false);
        if (profileFetchFailed) {
          toast.error('Profile load nahi ho paaya. Internet check karein — aapka account safe hai.');
        }
        navigate('/home');
        return;
      }

      setLoginLoading(false);
      toast.success('Login successful!');
      supabase.auth.getSession().then(({ data: sData }) => { saveCurrentAccount(data.user, profile, sData.session, loginPass); }).catch(() => {});
      if (profile?.is_admin) {
        navigate('/admin');
      } else {
        navigate('/home');
      }
    } else {
      setLoginLoading(false);
      navigate('/home');
    }
  };

  // Handle Signup submission
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFirst.trim() || !regLast.trim()) {
      toast.error('Please enter both First Name and Last Name');
      return;
    }
    if (!regUser.trim()) {
      toast.error('Please choose a username');
      return;
    }
    const cleanUsername = regUser.toLowerCase().trim();
    if (!/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
      toast.error('Username must be 3-20 characters (letters, numbers, _ and . allowed)');
      return;
    }
    if (contactMode === 'email' && (!regContact.trim() || !regContact.includes('@'))) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (contactMode === 'phone' && (!regContact.trim() || regContact.length < 8)) {
      toast.error('Please enter your mobile number');
      return;
    }
    if (regPass.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setRegLoading(true);
    const fullName = (regFirst.trim() + ' ' + regLast.trim()).trim();

    try {
      const { data: userExists } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (userExists) {
        toast.error('This username is already taken. Please choose another.');
        setRegLoading(false);
        return;
      }

      const emailToUse = regContact.includes('@')
        ? regContact.trim().toLowerCase()
        : cleanUsername + '@pixelgram.app';

      const { data, error } = await supabase.auth.signUp({
        email: emailToUse,
        password: regPass,
        options: {
          data: {
            username: cleanUsername,
            full_name: fullName,
          },
        },
      });

      if (error) {
        toast.error(error.message);
        setRegLoading(false);
        return;
      }

      const userId = data.user?.id;
      if (userId) {
        try {
          await updateProfile(userId, {
            full_name: fullName,
          });
        } catch {
          // Profile trigger will handle creation
        }
      }

      if (!data.session) {
        toast.success('Account created! Please check your email for confirmation link.');
        setIsSignUp(false);
      } else {
        toast.success('Account created successfully! Welcome to Pixelgram.');
        navigate('/home');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast.error(msg);
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="aurora-auth-root">
      {/* Aurora glow background */}
      <span className="aurora a1" />
      <span className="aurora a2" />
      <span className="aurora a3" />

      <div className="tilt" id="tilt" ref={tiltRef}>
        <div className={'card ' + (isSignUp ? 'signup' : '')} id="card" ref={cardRef}>
          <div className="glow" />

          {/* Dynamic rotating color panel with particle canvas */}
          <div className="panel">
            <div className="grain" />
            <canvas id="fx" ref={canvasRef} />
            <div className="shape sh1"><i /></div>
            <div className="shape sh2"><i /></div>
            <div className="shape sh3"><i /></div>
          </div>

          {/* Welcome Text Left & Right */}
          <div className="welcome right">
            <h2>WELCOME Pixelgram</h2>
            <p>Sign in to your account and pick up right where you left off.</p>
          </div>
          <div className="welcome left">
            <h2>WELCOME Pixelgram</h2>
            <p>Create your account and join the conversation.</p>
          </div>

          {/* LOGIN FORM */}
          <div className="form-box login">
            <form onSubmit={handleLogin} id="loginForm">
              <h1 className="stag" style={{ '--i': 0 } as React.CSSProperties}>Sign In</h1>
              <p className="tag stag" style={{ '--i': 0 } as React.CSSProperties}>Sign in to your account</p>

              <div className="field stag" style={{ '--i': 1 } as React.CSSProperties}>
                <input
                  type="text"
                  id="l-user"
                  placeholder=" "
                  required
                  autoComplete="username"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                />
                <label htmlFor="l-user">Username, Email or Phone</label>
                <svg className="ico" viewBox="0 0 24 24">
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z" />
                </svg>
              </div>

              <div className="field stag" style={{ '--i': 2 } as React.CSSProperties}>
                <input
                  type={loginShowPass ? 'text' : 'password'}
                  id="l-pass"
                  placeholder=" "
                  required
                  autoComplete="current-password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                />
                <label htmlFor="l-pass">Password</label>
                <button
                  type="button"
                  className="eye"
                  onClick={() => setLoginShowPass(!loginShowPass)}
                  aria-label="Toggle password"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5C6.5 5 2.7 9 1 12c1.7 3 5.5 7 11 7s9.3-4 11-7c-1.7-3-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" />
                  </svg>
                </button>
                <svg className="ico" viewBox="0 0 24 24">
                  <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9zm-8-2a3 3 0 0 1 6 0v2H9z" />
                </svg>
              </div>

              <div className="forgot stag" style={{ '--i': 3 } as React.CSSProperties}>
                <button
                  type="button"
                  className="switch"
                  onClick={() => navigate('/forgot-password')}
                >
                  Forgot Password?
                </button>
              </div>

              <button
                className="btn-aurora stag"
                style={{ '--i': 4 } as React.CSSProperties}
                type="submit"
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                    <path d="M10 17l1.4-1.4L8.800 13H20v-2H8.800l2.600-2.600L10 7l-5 5zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
                  </svg>
                )}
                <span>{loginLoading ? 'Signing In…' : 'Sign In'}</span>
              </button>

              <p className="alt stag" style={{ '--i': 5 } as React.CSSProperties}>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="switch"
                  onClick={() => setIsSignUp(true)}
                >
                  Sign Up
                </button>
              </p>

              <div className="note stag" style={{ '--i': 6 } as React.CSSProperties}>
                New here? First{' '}
                <button
                  type="button"
                  className="switch"
                  onClick={() => setIsSignUp(true)}
                >
                  Sign Up
                </button>{' '}
                to create your account, then log in.
              </div>
            </form>
          </div>

          {/* SIGN UP FORM */}
          <div className="form-box register">
            <form onSubmit={handleSignUp} id="signupForm">
              <h1 className="stag" style={{ '--i': 0 } as React.CSSProperties}>Sign Up</h1>
              <p className="tag stag" style={{ '--i': 0 } as React.CSSProperties}>Create your Pixelgram account</p>

              {/* Facebook style First & Last Name */}
              <div className="row stag" style={{ '--i': 1 } as React.CSSProperties}>
                <div className="field noico">
                  <input
                    type="text"
                    id="s-first"
                    placeholder=" "
                    required
                    autoComplete="given-name"
                    value={regFirst}
                    onChange={(e) => setRegFirst(e.target.value)}
                  />
                  <label htmlFor="s-first">First name</label>
                </div>
                <div className="field noico">
                  <input
                    type="text"
                    id="s-last"
                    placeholder=" "
                    required
                    autoComplete="family-name"
                    value={regLast}
                    onChange={(e) => setRegLast(e.target.value)}
                  />
                  <label htmlFor="s-last">Last name</label>
                </div>
              </div>

              <div className="field stag" style={{ '--i': 2 } as React.CSSProperties}>
                <input
                  type="text"
                  id="s-user"
                  placeholder=" "
                  required
                  autoComplete="username"
                  value={regUser}
                  onChange={(e) => setRegUser(e.target.value)}
                />
                <label htmlFor="s-user">Username</label>
                <svg className="ico" viewBox="0 0 24 24">
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z" />
                </svg>
              </div>

              <div className="flex gap-2 mb-2 stag" style={{ '--i': 3 } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => { setContactMode('email'); setRegContact(''); }}
                  className={`flex-1 py-1.5 px-3 text-xs rounded-xl border transition-all ${
                    contactMode === 'email' ? 'border-primary bg-primary/20 text-white font-bold' : 'border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  ✉️ Email
                </button>
                <button
                  type="button"
                  onClick={() => { setContactMode('phone'); setRegContact(''); }}
                  className={`flex-1 py-1.5 px-3 text-xs rounded-xl border transition-all ${
                    contactMode === 'phone' ? 'border-primary bg-primary/20 text-white font-bold' : 'border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  📱 Mobile Number
                </button>
              </div>

              {contactMode === 'phone' ? (
                <div className="stag mb-3" style={{ '--i': 3 } as React.CSSProperties}>
                  <CountryPhoneInput
                    value={regContact}
                    onChange={(val) => setRegContact(val)}
                    placeholder="Enter mobile number"
                  />
                </div>
              ) : (
                <div className="field stag" style={{ '--i': 3 } as React.CSSProperties}>
                  <input
                    type="email"
                    id="s-contact"
                    placeholder=" "
                    required
                    autoComplete="email"
                    value={regContact}
                    onChange={(e) => setRegContact(e.target.value)}
                  />
                  <label htmlFor="s-contact">Email address</label>
                  <svg className="ico" viewBox="0 0 24 24">
                    <path d="M3 5h18a1 1 0 0 1 1 1v.5l-10 6-10-6V6a1 1 0 0 1 1-1zm-1 4.3V18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V9.3l-10 6z" />
                  </svg>
                </div>
              )}

              <div className="field stag" style={{ '--i': 4 } as React.CSSProperties}>
                <input
                  type={regShowPass ? 'text' : 'password'}
                  id="s-pass"
                  placeholder=" "
                  required
                  autoComplete="new-password"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
                <label htmlFor="s-pass">Password</label>
                <button
                  type="button"
                  className="eye"
                  onClick={() => setRegShowPass(!regShowPass)}
                  aria-label="Toggle password"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5C6.5 5 2.7 9 1 12c1.7 3 5.5 7 11 7s9.3-4 11-7c-1.7-3-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" />
                  </svg>
                </button>
                <svg className="ico" viewBox="0 0 24 24">
                  <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9zm-8-2a3 3 0 0 1 6 0v2H9z" />
                </svg>
              </div>

              <button
                className="btn-aurora stag"
                style={{ '--i': 5 } as React.CSSProperties}
                type="submit"
                disabled={regLoading}
              >
                {regLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                    <path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9 0V9H4v3H1v2h3v3h2v-3h3v-2zm9 2c-2.700 0-8 1.300-8 4v2h16v-2c0-2.700-5.300-4-8-4z" />
                  </svg>
                )}
                <span>{regLoading ? 'Creating account…' : 'Sign Up'}</span>
              </button>

              <p className="alt stag" style={{ '--i': 6 } as React.CSSProperties}>
                Already have an account?{' '}
                <button
                  type="button"
                  className="switch"
                  onClick={() => setIsSignUp(false)}
                >
                  Sign In
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileAuroraAuth;
