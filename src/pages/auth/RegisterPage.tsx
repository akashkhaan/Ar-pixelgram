import MobileAuroraAuth from '@/components/auth/MobileAuroraAuth';
import DesktopSlidingAuth from '@/components/auth/DesktopSlidingAuth';
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { uploadImage, updateProfile } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AvatarCropper from '@/components/common/AvatarCropper';
import {
  ArrowLeft, Loader2, Eye, EyeOff, Camera, Mail, Phone, Check, User as UserIcon,
} from 'lucide-react';

type Step = 'name' | 'username' | 'dob' | 'contact' | 'password' | 'photo' | 'terms' | 'code' | 'welcome';

const BASE_STEPS: Step[] = ['name', 'username', 'dob', 'contact', 'password', 'photo', 'terms'];

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('name');
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [contactType, setContactType] = useState<'email' | 'phone' | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+91');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rawPhoto, setRawPhoto] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  // Mobile number wale signup me terms ke baad SMS code verify hota hai.
  const STEPS: Step[] = contactType === 'phone' ? [...BASE_STEPS, 'code'] : BASE_STEPS;
  const stepIndex = STEPS.indexOf(step);

  const goBack = () => {
    if (step === 'welcome') return;
    if (stepIndex <= 0) { navigate('/login'); return; }
    setStep(STEPS[stepIndex - 1]);
  };

  const next = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);

  // ---- step validations -------------------------------------------------
  const submitName = () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error('First name aur last name dono daalein'); return; }
    next();
  };

  const submitUsername = async () => {
    const value = username.toLowerCase().trim();
    if (!/^[a-z0-9_.]{3,20}$/.test(value)) {
      toast.error('Username 3-20 characters ka ho (letters, numbers, _ aur . allowed)');
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.from('profiles').select('user_id').eq('username', value).maybeSingle();
      if (data) { toast.error('Ye username pehle se le liya gaya hai'); return; }
      setUsername(value);
      next();
    } finally {
      setLoading(false);
    }
  };

  const submitDob = () => {
    if (!dob) { toast.error('Apni date of birth select karein'); return; }
    const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(age) || age < 0) { toast.error('Sahi date of birth select karein'); return; }
    if (age < 13) { toast.error('Account banane ke liye kam se kam 13 saal ki umar zaroori hai'); return; }
    next();
  };

  const submitContact = () => {
    if (contactType === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { toast.error('Sahi email address daalein'); return; }
    } else if (contactType === 'phone') {
      const value = phone.replace(/[^\d+]/g, '');
      if (!value.startsWith('+')) { toast.error('Country code ke saath number daalein, jaise +91…'); return; }
      if (!/^\+[1-9]\d{7,14}$/.test(value)) { toast.error('Country code ke saath poora mobile number daalein'); return; }
      setPhone(value);
    } else {
      toast.error('Email ya mobile number me se ek chunein');
      return;
    }
    next();
  };

  const submitPassword = () => {
    if (password.length < 6) { toast.error('Password kam se kam 6 characters ka ho'); return; }
    if (password !== confirmPassword) { toast.error('Dono password same nahi hain'); return; }
    next();
  };

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Sirf image file select karein'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Photo 8MB se chhoti honi chahiye'); return; }
    setRawPhoto(file);
  };

  // ---- account creation --------------------------------------------------
  const e164Phone = (() => {
    const digits = phone.replace(/[^\d+]/g, '');
    return digits.startsWith('+') ? digits : `+${digits}`;
  })();

  const finishProfile = async (userId: string) => {
    let avatarUrl: string | undefined;
    if (photoFile) {
      try {
        avatarUrl = await uploadImage('avatars', photoFile, userId);
      } catch {
        toast.error('Photo upload nahi ho paayi — baad me Edit Profile se laga sakte hain');
      }
    }
    try {
      await updateProfile(userId, {
        full_name: fullName,
        dob: dob || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });
    } catch {
      /* profile trigger thoda late ho sakta hai — login ke baad bhi set ho jayega */
    }
  };

  // Number wale signup me SMS par 6-digit code bhejte hain.
  const sendPhoneOtp = async (isResend = false) => {
    const { data, error } = await supabase.functions.invoke('signup-phone-start', {
      body: { phone: e164Phone },
    });
    if (error || data?.error) {
      toast.error(data?.error || 'Code bhejne me dikkat aayi. Dobara try karein.');
      return false;
    }
    toast.success(isResend ? 'Naya code bhej diya gaya' : `Code bhej diya gaya ${e164Phone} par`);
    return true;
  };

  const resendPhoneOtp = async () => {
    setResending(true);
    try { await sendPhoneOtp(true); } finally { setResending(false); }
  };

  const verifyPhoneAndCreate = async () => {
    if (!/^\d{6}$/.test(otp.trim())) { toast.error('SMS me aaya 6-digit code daalein'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('signup-phone-confirm', {
        body: {
          phone: e164Phone,
          code: otp.trim(),
          password,
          username,
          full_name: fullName,
        },
      });
      if (error || data?.error || !data?.ok) {
        toast.error(data?.error || 'Code verify nahi hua. Dobara try karein.');
        return;
      }
      if (data.access_token && data.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (!sessionError) {
          if (data.user_id) await finishProfile(data.user_id);
          setStep('welcome');
          setTimeout(() => navigate('/home'), 2000);
          return;
        }
      }
      toast.success('Account ban gaya! Ab apne number se log in karein.');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    setLoading(true);
    try {
      // Number wala signup: pehle SMS code, phir account.
      if (contactType === 'phone') {
        const sent = await sendPhoneOtp();
        if (sent) { setOtp(''); setStep('code'); }
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { username, full_name: fullName } },
      });
      if (error) { toast.error(error.message); return; }

      const userId = data.user?.id;
      if (!data.session) {
        toast.success('Account ban gaya! Email me confirmation link check karein.');
        navigate('/login');
        return;
      }

      if (userId) await finishProfile(userId);

      setStep('welcome');
      setTimeout(() => navigate('/home'), 2000);
    } finally {
      setLoading(false);
    }
  };

  // ---- welcome screen ----------------------------------------------------
  if (step === 'welcome') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="space-y-5 page-transition">
          {photoPreview ? (
            <img src={photoPreview} alt={fullName} className="w-28 h-28 rounded-full object-cover mx-auto ring-4 ring-primary/30" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-primary text-3xl font-bold">
              {(firstName[0] || username[0] || '?').toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold gradient-text">Welcome to Pixelgram</h1>
            <p className="text-lg font-semibold text-foreground">{fullName}</p>
            <p className="text-sm text-muted-foreground">@{username}</p>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop View */}
      <div className="hidden md:block">
        <DesktopSlidingAuth initialMode="register" />
      </div>

      {/* Mobile View - Aurora Futuristic Rotating Card (Bina Desktop Site On Kiye) */}
      <div className="block md:hidden">
        <MobileAuroraAuth initialMode="register" />
      </div>
    </>
  );
};

export default RegisterPage;