import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getFeedStories } from '@/services/api';

// Jin users ki abhi active story hai unki list (poori website me ek hi baar load hoti hai)
let cache = new Set<string>();
let loadedFor: string | null = null;
let lastLoad = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

export function refreshStoryUsers(userId: string) {
  if (inflight) return inflight;
  inflight = getFeedStories(userId)
    .then(list => {
      cache = new Set(list.map(s => s.user_id));
      loadedFor = userId;
      lastLoad = Date.now();
      emit();
    })
    .catch(() => {})
    .finally(() => { inflight = null; });
  return inflight;
}

export function useStoryUsers(): Set<string> {
  const { user } = useAuth();
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    if (!user) return;
    if (loadedFor !== user.id || Date.now() - lastLoad > 60000) void refreshStoryUsers(user.id);
    const t = setInterval(() => refreshStoryUsers(user.id), 60000);
    return () => clearInterval(t);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return user && loadedFor === user.id ? cache : new Set();
}

export function useHasStory(userId?: string | null): boolean {
  const set = useStoryUsers();
  return !!userId && set.has(userId);
}
