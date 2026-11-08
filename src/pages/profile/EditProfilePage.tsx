import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import MobileLayout from '@/components/layouts/MobileLayout';
import useGoBack from '@/hooks/use-go-back';
import { updateProfile, uploadImage, checkUsernameAvailable } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Camera,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Link2,
  Globe,
  Instagram,
  Facebook,
  Youtube,
  ChevronRight,
  X,
  Trash2,
} from 'lucide-react';

const EditProfilePage: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack("/profile");

  const [form, setForm] = useState({
    full_name: '',
    username: '',
    bio: '',
    dob: '',
    is_private: false,
    website_link_1: '',
    website_link_2: '',
    instagram_url: '',
    facebook_url: '',
  });

  // Modal for editing the 4 links
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [modalLinks, setModalLinks] = useState({
    website_link_1: '',
    website_link_2: '',
    instagram_url: '',
    facebook_url: '',
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linksSaving, setLinksSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  useEffect(() => {
    if (profile) {
      const initialLinks = {
        website_link_1: profile.website_link_1 || (user?.user_metadata?.website_link_1 as string) || '',
        website_link_2: profile.website_link_2 || (user?.user_metadata?.website_link_2 as string) || '',
        instagram_url: profile.instagram_url || (user?.user_metadata?.instagram_url as string) || '',
        facebook_url: profile.facebook_url || (user?.user_metadata?.facebook_url as string) || '',
      };

      setForm({
        full_name: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        dob: profile.dob || '',
        is_private: profile.is_private,
        ...initialLinks,
      });

      setModalLinks(initialLinks);

      if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
    }
  }, [profile, user]);

  // Username uniqueness check with debounce
  useEffect(() => {
    const trimmed = form.username.trim().toLowerCase();
    if (!trimmed || trimmed === profile?.username) { setUsernameStatus('idle'); return; }
    if (!/^[a-z0-9._]{3,30}$/.test(trimmed)) { setUsernameStatus('invalid'); return; }

    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      if (!user) return;
      const ok = await checkUsernameAvailable(trimmed, user.id);
      setUsernameStatus(ok ? 'available' : 'taken');
    }, 600);
    return () => clearTimeout(t);
  }, [form.username, profile?.username, user]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Avatar must be under 2MB'); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // Open links modal with fresh form data
  const handleOpenLinksModal = () => {
    setModalLinks({
      website_link_1: form.website_link_1 || '',
      website_link_2: form.website_link_2 || '',
      instagram_url: form.instagram_url || '',
      facebook_url: form.facebook_url || '',
    });
    setShowLinksModal(true);
  };

  // Save links from the 4-box modal
  const handleSaveLinksModal = async () => {
    const cleanLink1 = modalLinks.website_link_1.trim();
    const cleanLink2 = modalLinks.website_link_2.trim();
    const cleanInsta = modalLinks.instagram_url.trim();
    const cleanFb = modalLinks.facebook_url.trim();

    // Update main form state
    setForm(prev => ({
      ...prev,
      website_link_1: cleanLink1,
      website_link_2: cleanLink2,
      instagram_url: cleanInsta,
      facebook_url: cleanFb,
    }));

    if (!user) {
      setShowLinksModal(false);
      return;
    }

    setLinksSaving(true);
    try {
      const payload: any = {
        website_link_1: cleanLink1 || null,
        website_link_2: cleanLink2 || null,
        instagram_url: cleanInsta || null,
        facebook_url: cleanFb || null,
      };

      try {
        await updateProfile(user.id, payload);
      } catch (err) {
        console.warn('Fallback update if migration pending:', err);
      }

      try {
        await supabase.auth.updateUser({
          data: {
            website_link_1: cleanLink1 || null,
            website_link_2: cleanLink2 || null,
            instagram_url: cleanInsta || null,
            facebook_url: cleanFb || null,
          },
        });
      } catch {}

      await refreshProfile();
      toast.success('Links save ho gaye ✨');
      setShowLinksModal(false);
    } catch {
      toast.error('Links save nahi huye, dobara koshish karein');
    } finally {
      setLinksSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (usernameStatus === 'taken') { toast.error('यह username पहले से लिया जा चुका है'); return; }
    if (usernameStatus === 'invalid') { toast.error('Username 3-30 अक्षर, केवल a-z 0-9 . _'); return; }
    if (usernameStatus === 'checking') { toast.error('Username check हो रहा है, रुकें…'); return; }

    setLoading(true);
    try {
      let avatarUrl = profile?.avatar_url || '';
      if (avatarFile) {
        avatarUrl = await uploadImage('avatars', avatarFile, user.id);
      }

      const cleanLink1 = form.website_link_1.trim();
      const cleanLink2 = form.website_link_2.trim();
      const cleanInsta = form.instagram_url.trim();
      const cleanFb = form.facebook_url.trim();

      const profilePayload: any = {
        full_name: form.full_name,
        username: form.username.trim().toLowerCase(),
        bio: form.bio,
        avatar_url: avatarUrl,
        dob: form.dob || null,
        is_private: form.is_private,
        website_link_1: cleanLink1 || null,
        website_link_2: cleanLink2 || null,
        instagram_url: cleanInsta || null,
        facebook_url: cleanFb || null,
      };

      // 1. Try updating profiles table with all fields
      try {
        await updateProfile(user.id, profilePayload);
      } catch (dbErr: any) {
        console.warn('Fallback update if migration pending:', dbErr);
        const { website_link_1, website_link_2, instagram_url, facebook_url, ...corePayload } = profilePayload;
        await updateProfile(user.id, corePayload);
      }

      // 2. Also save into Supabase auth user metadata for seamless client-side backup
      try {
        await supabase.auth.updateUser({
          data: {
            website_link_1: cleanLink1 || null,
            website_link_2: cleanLink2 || null,
            instagram_url: cleanInsta || null,
            facebook_url: cleanFb || null,
          },
        });
      } catch (authMetaErr) {
        console.warn('User metadata backup skipped:', authMetaErr);
      }

      await refreshProfile();
      toast.success('Profile update हो गया!');
      navigate('/profile');
    } catch {
      toast.error('Profile update नहीं हुआ, दोबारा कोशिश करें।');
    } finally {
      setLoading(false);
    }
  };

  // Count how many links are currently active
  const activeLinksCount = [
    form.website_link_1,
    form.website_link_2,
    form.instagram_url,
    form.facebook_url,
  ].filter(l => Boolean(l && l.trim())).length;

  return (
    <MobileLayout hideNav>
      <div className="p-4 page-transition">
        <button onClick={goBack} className="flex items-center gap-2 mb-5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <h2 className="text-xl font-bold text-foreground mb-6">Edit Profile</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-24 h-24 rounded-full object-cover ring-4 ring-primary/30" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-2xl">
                  {profile?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary/90 transition-colors">
                <Camera className="w-4 h-4 text-primary-foreground" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Tap to change photo (max 2MB)</p>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" className="h-11" maxLength={50} />
          </div>

          {/* Username field with live uniqueness check */}
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">@</span>
              <Input
                id="username"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, '').toLowerCase() }))}
                placeholder="your_username"
                className="h-11 pl-7 pr-10"
                maxLength={30}
                autoCapitalize="none"
                spellCheck={false}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle className="w-4 h-4 text-destructive" />}
              </div>
            </div>
            {usernameStatus === 'taken' && <p className="text-xs text-destructive">यह username पहले से लिया जा चुका है</p>}
            {usernameStatus === 'invalid' && <p className="text-xs text-destructive">3-30 अक्षर, केवल a-z, 0-9, _ और . allowed</p>}
            {usernameStatus === 'available' && <p className="text-xs text-green-500">Username available है!</p>}
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="Tell something about yourself…" rows={3} maxLength={150} className="resize-none" />
            <p className="text-xs text-muted-foreground text-right">{form.bio.length}/150</p>
          </div>

          {/* Date of Birth */}
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input id="dob" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} className="h-11" />
          </div>

          {/* Links Row (Instagram Style: Tap to open 4-box modal) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleOpenLinksModal}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-card border border-border hover:bg-muted/40 transition-colors group cursor-pointer text-left shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">Add Links</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {activeLinksCount > 0
                      ? `${activeLinksCount} link${activeLinksCount > 1 ? 's' : ''} added (YouTube, Insta, FB, Web)`
                      : 'Website, YouTube, Instagram, Facebook'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                {activeLinksCount > 0 && (
                  <span className="text-xs font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10">
                    {activeLinksCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </button>
          </div>

          {/* Private Account */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-card border border-border">
            <div>
              <p className="font-semibold text-sm text-foreground">Private Account</p>
              <p className="text-xs text-muted-foreground">Only approved followers can see your posts</p>
            </div>
            <Switch checked={form.is_private} onCheckedChange={v => setForm(p => ({ ...p, is_private: v }))} />
          </div>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* 4-Box Links Modal (Instagram Style Dialog) */}
      {showLinksModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom-5 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">Add Links</h3>
                  <p className="text-xs text-muted-foreground">YouTube, Instagram, Facebook & Website URLs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLinksModal(false)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 Input Boxes */}
            <div className="space-y-3.5 pt-1">
              {/* Box 1: Link 1 (Website / YouTube) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="m_link1" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-red-500" />
                    <span>Link 1 (YouTube ya Website URL)</span>
                  </Label>
                  {modalLinks.website_link_1 && (
                    <button
                      type="button"
                      onClick={() => setModalLinks(p => ({ ...p, website_link_1: '' }))}
                      className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="m_link1"
                    type="url"
                    value={modalLinks.website_link_1}
                    onChange={e => setModalLinks(p => ({ ...p, website_link_1: e.target.value }))}
                    placeholder="https://youtube.com/@channel ya website"
                    className="h-10 pl-9 text-xs"
                  />
                </div>
              </div>

              {/* Box 2: Link 2 (Website URL) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="m_link2" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span>Link 2 (Website URL)</span>
                  </Label>
                  {modalLinks.website_link_2 && (
                    <button
                      type="button"
                      onClick={() => setModalLinks(p => ({ ...p, website_link_2: '' }))}
                      className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="m_link2"
                    type="url"
                    value={modalLinks.website_link_2}
                    onChange={e => setModalLinks(p => ({ ...p, website_link_2: e.target.value }))}
                    placeholder="https://yourwebsite.com"
                    className="h-10 pl-9 text-xs"
                  />
                </div>
              </div>

              {/* Box 3: Instagram */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="m_insta" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Instagram className="w-3.5 h-3.5 text-pink-500" />
                    <span>Instagram Account (Link ya @handle)</span>
                  </Label>
                  {modalLinks.instagram_url && (
                    <button
                      type="button"
                      onClick={() => setModalLinks(p => ({ ...p, instagram_url: '' }))}
                      className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Instagram className="w-4 h-4 text-pink-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="m_insta"
                    value={modalLinks.instagram_url}
                    onChange={e => setModalLinks(p => ({ ...p, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/username ya @username"
                    className="h-10 pl-9 text-xs"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Box 4: Facebook */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="m_fb" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Facebook className="w-3.5 h-3.5 text-blue-600" />
                    <span>Facebook Account (Profile URL ya Username)</span>
                  </Label>
                  {modalLinks.facebook_url && (
                    <button
                      type="button"
                      onClick={() => setModalLinks(p => ({ ...p, facebook_url: '' }))}
                      className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Facebook className="w-4 h-4 text-blue-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="m_fb"
                    value={modalLinks.facebook_url}
                    onChange={e => setModalLinks(p => ({ ...p, facebook_url: e.target.value }))}
                    placeholder="https://facebook.com/username"
                    className="h-10 pl-9 text-xs"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground pt-1 bg-muted/30 p-2.5 rounded-lg border border-border/40">
                💡 <b>Tip:</b> Kisi link ko profile se hatane ke liye uska box khali (delete) karke <b>Save Links</b> par click karein.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLinksModal(false)}
                className="flex-1 h-10 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveLinksModal}
                disabled={linksSaving}
                className="flex-1 h-10 text-xs font-semibold"
              >
                {linksSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : 'Save Links'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default EditProfilePage;
