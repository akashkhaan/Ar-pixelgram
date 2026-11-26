-- ============================================================================
--  Comment likes (post / reel / video) + mention notifications
--
--  Kyun: comment par like karne ka koi table hi nahi tha, isliye "like" sirf
--  toast dikhata tha — count, notification aur push kuch nahi jaata tha.
--  @mention par bhi koi notification nahi jaata tha.
-- ============================================================================

begin;

-- ---------- 1. Comment like tables ----------
create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.reel_comment_likes (
  id              uuid primary key default gen_random_uuid(),
  reel_comment_id uuid not null references public.reel_comments(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (reel_comment_id, user_id)
);

create table if not exists public.video_comment_likes (
  id               uuid primary key default gen_random_uuid(),
  video_comment_id uuid not null references public.video_comments(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (video_comment_id, user_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists reel_comment_likes_comment_idx on public.reel_comment_likes (reel_comment_id);
create index if not exists video_comment_likes_comment_idx on public.video_comment_likes (video_comment_id);

alter table public.comment_likes        enable row level security;
alter table public.reel_comment_likes   enable row level security;
alter table public.video_comment_likes  enable row level security;

-- sab padh sakte hain (count dikhane ke liye), apna like khud manage
do $$
declare t text;
begin
  foreach t in array array['comment_likes', 'reel_comment_likes', 'video_comment_likes'] loop
    execute format('drop policy if exists "%s read" on public.%I', t, t);
    execute format('create policy "%s read" on public.%I for select using (true)', t, t);

    execute format('drop policy if exists "%s insert own" on public.%I', t, t);
    execute format('create policy "%s insert own" on public.%I for insert to authenticated with check (user_id = auth.uid())', t, t, t);

    execute format('drop policy if exists "%s delete own" on public.%I', t, t);
    execute format('create policy "%s delete own" on public.%I for delete to authenticated using (user_id = auth.uid())', t, t, t);

    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ---------- 2. Naye notification types ----------
do $$
declare
  allowed text[] := array[
    'like','comment','follow','follow_request','follow_accepted','verified',
    'broadcast','suspended','story_like','story_reply','reel_like','reel_comment',
    'comment_reply','message','new_story','new_post','new_reel','new_video',
    'group_mention','group_message','group_call',
    -- naye
    'comment_like','reel_comment_like','video_comment_like',
    'mention','reel_mention','video_mention'
  ];
begin
  alter table public.notifications drop constraint if exists notifications_type_check;
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type = any(%L::text[]))',
    allowed
  );
end $$;

commit;
