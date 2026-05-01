set check_function_bodies = off;

create or replace function public.sync_social_author_identity_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username
     or new.avatar_url is distinct from old.avatar_url then
    update public.social_posts
    set
      author_username = new.username,
      author_avatar_url = new.avatar_url
    where author_id = new.id;

    update public.social_comments
    set
      author_username = new.username,
      author_avatar_url = new.avatar_url
    where author_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_social_author_identity_from_profile on public.user_profiles;

create trigger trg_sync_social_author_identity_from_profile
after update of username, avatar_url
on public.user_profiles
for each row
execute function public.sync_social_author_identity_from_profile();

update public.social_posts as post
set
  author_username = profile.username,
  author_avatar_url = profile.avatar_url
from public.user_profiles as profile
where profile.id = post.author_id
  and (
    post.author_username is distinct from profile.username
    or post.author_avatar_url is distinct from profile.avatar_url
  );

update public.social_comments as comment
set
  author_username = profile.username,
  author_avatar_url = profile.avatar_url
from public.user_profiles as profile
where profile.id = comment.author_id
  and (
    comment.author_username is distinct from profile.username
    or comment.author_avatar_url is distinct from profile.avatar_url
  );
