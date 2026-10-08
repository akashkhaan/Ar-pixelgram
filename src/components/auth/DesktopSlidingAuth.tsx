import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { getProfile, updateProfile } from '@/services/api';
import { withTimeout } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, UserPlus, Loader2 } from 'lucide-react';

interface DesktopSlidingAuthProps {
  initialMode?: 'login' | 'register';
}

export const DesktopSlidingAuth: React.FC<DesktopSlidingAuthProps> = ({ initialMode = 'login' }) => {
  const [isActive, setIsActive] = useState(initialMode === 'register');
  const navigate = useNavigate();

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPass, setLoginShowPass] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Register form state (Facebook style First Name + Last Name)
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [contactMode, setContactMode] = useState<'email' | 'phone'>('email');
  const [regPassword, setRegPassword] = useState('');
  const [regShowPass, setRegShowPass] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) {
      toast.error('Please fill all fields');
      return;
    }
    setLoginLoading(true);

    let data: Awaited<ReturnType<typeof supabase.auth.getUser>>['data'] | null = null;
    let loginError: string | null = null;

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('login-with-identifier', {
        body: { identifier: loginIdentifier.trim(), password: loginPassword },
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

    if (!data?.user && !loginError && loginIdentifier.includes('@')) {
      const res = await supabase.auth.signInWithPassword({ email: loginIdentifier.trim(), password: loginPassword });
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

  // Handle Register submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regLastName.trim()) {
      toast.error('Please enter both First Name and Last Name');
      return;
    }
    if (!regUsername.trim()) {
      toast.error('Please enter a username');
      return;
    }
    const cleanUsername = regUsername.toLowerCase().trim();
    if (!/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
      toast.error('Username must be 3-20 characters (letters, numbers, _ and . allowed)');
      return;
    }
    if (contactMode === 'email' && (!regEmail.trim() || !regEmail.includes('@'))) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (contactMode === 'phone' && (!regEmail.trim() || regEmail.length < 8)) {
      toast.error('Please enter a valid mobile number');
      return;
    }
    if (regPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setRegLoading(true);
    const fullName = (regFirstName.trim() + ' ' + regLastName.trim()).trim();

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

      const emailToUse = contactMode === 'email'
        ? regEmail.trim().toLowerCase()
        : `${cleanUsername}@pixelgram.app`;

      const { data, error } = await supabase.auth.signUp({
        email: emailToUse,
        password: regPassword,
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
        setIsActive(false);
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
    <div className="auth-desktop-wrapper">
      <div className={'auth-desktop-card ' + (isActive ? 'active' : '')} id="desktop-auth-container">
        {/* Registration Form (Left Side) */}
        <div className="form-container register-container">
          <form onSubmit={handleRegisterSubmit}>
            <h1 className="brand-title">Pixelgram</h1>
            <p className="subtitle">Create a new account</p>

            {/* Facebook Style: First Name and Last Name Side by Side */}
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <div className="input-group mb-0">
                <label>First Name</label>
                <div className="input-box">
                  <input
                    type="text"
                    placeholder="First name"
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="input-group mb-0">
                <label>Last Name</label>
                <div className="input-box">
                  <input
                    type="text"
                    placeholder="Last name"
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="input-group">
              <label>Username</label>
              <div className="input-box">
                <input
                  type="text"
                  placeholder="username (e.g. john_57)"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  autoCapitalize="none"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Contact Detail</label>
                <div className="flex gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => { setContactMode('email'); setRegEmail(''); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                      contactMode === 'email' ? 'bg-primary text-white font-bold border-primary' : 'text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    ✉️ Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setContactMode('phone'); setRegEmail(''); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                      contactMode === 'phone' ? 'bg-primary text-white font-bold border-primary' : 'text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    📱 Mobile Number
                  </button>
                </div>
              </div>

              {contactMode === 'phone' ? (
                <div className="mt-1">
                  <CountryPhoneInput
                    value={regEmail}
                    onChange={(val) => setRegEmail(val)}
                    placeholder="Enter mobile number"
                  />
                </div>
              ) : (
                <div className="input-box">
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    autoCapitalize="none"
                    required
                  />
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Password</label>
              <div className="input-box">
                <input
                  type={regShowPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setRegShowPass(!regShowPass)}
                  className="eye-icon-btn"
                  aria-label="Toggle password"
                >
                  {regShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary-auth" disabled={regLoading}>
              {regLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              {regLoading ? 'Creating account…' : 'Sign Up'}
            </button>

            <p className="bottom-text">
              Already have an account?{' '}
              <span onClick={() => setIsActive(false)}>Sign In</span>
            </p>
          </form>
        </div>

        {/* Login Form (Right Side) */}
        <div className="form-container login-container">
          <form onSubmit={handleLoginSubmit}>
            <h1 className="brand-title">Pixelgram</h1>
            <p className="subtitle">Sign in to your account</p>

            <div className="input-group">
              <label>Username, Email or Phone</label>
              <div className="input-box">
                <input
                  type="text"
                  placeholder="username, you@example.com"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label>Password</label>
              <div className="input-box">
                <input
                  type={loginShowPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setLoginShowPass(!loginShowPass)}
                  className="eye-icon-btn"
                  aria-label="Toggle password"
                >
                  {loginShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Link to="/forgot-password" className="forgot-password">
              Forgot Password?
            </Link>

            <button type="submit" className="btn-primary-auth" disabled={loginLoading}>
              {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 mr-1" />}
              {loginLoading ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="bottom-text">
              Don't have an account?{' '}
              <span onClick={() => setIsActive(true)}>Sign Up</span>
            </p>
          </form>
        </div>

        {/* Purple Sliding Overlay */}
        <div className="toggle-container">
          <div className="toggle">
            {/* Panel visible when Login is active (Clicking Sign Up slides overlay right) */}
            <div className="toggle-panel toggle-left">
              <h1>Hello, Friend!</h1>
              <p>Enter your personal details to open an account with us.</p>
              <button type="button" onClick={() => setIsActive(true)}>
                Sign Up
              </button>
            </div>

            {/* Panel visible when Register is active (Clicking Sign In slides overlay left) */}
            <div className="toggle-panel toggle-right">
              <h1>Welcome Back!</h1>
              <p>To keep connected with us please login with your personal info.</p>
              <button type="button" onClick={() => setIsActive(false)}>
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopSlidingAuth;
