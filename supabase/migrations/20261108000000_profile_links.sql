-- Add Link 1, Link 2, Instagram and Facebook profile links to profiles
alter table public.profiles
  add column if not exists website_link_1 text,
  add column if not exists website_link_2 text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text;
