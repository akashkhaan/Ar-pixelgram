-- Reel owners can edit their own reel title/caption (there was no UPDATE policy,
-- so caption edits silently changed 0 rows).
DROP POLICY IF EXISTS "Users update own reels" ON public.reels;
CREATE POLICY "Users update own reels" ON public.reels
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT UPDATE ON public.reels TO authenticated;
