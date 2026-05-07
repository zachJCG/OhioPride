-- =====================================================================
-- Ohio Pride PAC :: Endorsement Notification Triggers (Phase 5)
--
-- Two AFTER triggers on public.endorsement_applications that call
-- Supabase Edge Functions via pg_net (HTTP POST):
--
--   1. tg_notify_new_application
--      Fires AFTER INSERT.
--      Calls /functions/v1/on-new-application.
--
--   2. tg_notify_status_endorsed
--      Fires AFTER UPDATE, only when status transitions TO 'endorsed'.
--      Calls /functions/v1/on-status-endorsed.
--
-- Webhook authentication uses a shared secret stored in Supabase Vault
-- under the name 'webhook_secret'. Both the trigger functions and the
-- Edge Functions must agree on this value.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists pg_net   with schema extensions;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------
-- 1. Helper: read the webhook secret from Vault.
--    Returns NULL if Vault is unset, so triggers degrade gracefully
--    rather than failing inserts/updates.
-- ---------------------------------------------------------------------
create or replace function public._get_webhook_secret()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'webhook_secret'
    limit 1;
  exception when others then
    v_secret := null;
  end;
  return v_secret;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Trigger function: on new application
-- ---------------------------------------------------------------------
create or replace function public.tg_notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := 'https://dkdxefzhttkmjhdbkvqn.supabase.co/functions/v1/on-new-application';
  v_secret text;
begin
  v_secret := public._get_webhook_secret();
  if v_secret is null then
    raise warning 'webhook_secret not in Vault, skipping notification for application %', NEW.id;
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('record', row_to_json(NEW)),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_application on public.endorsement_applications;
create trigger trg_notify_new_application
  after insert on public.endorsement_applications
  for each row
  execute function public.tg_notify_new_application();

-- ---------------------------------------------------------------------
-- 3. Trigger function: on status transition to 'endorsed'
-- ---------------------------------------------------------------------
create or replace function public.tg_notify_status_endorsed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := 'https://dkdxefzhttkmjhdbkvqn.supabase.co/functions/v1/on-status-endorsed';
  v_secret text;
begin
  -- Only fire on transition TO 'endorsed' (not on every update).
  if NEW.status is distinct from 'endorsed' then
    return NEW;
  end if;
  if OLD.status is not distinct from 'endorsed' then
    return NEW;
  end if;

  v_secret := public._get_webhook_secret();
  if v_secret is null then
    raise warning 'webhook_secret not in Vault, skipping notification for application %', NEW.id;
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
      'record',     row_to_json(NEW),
      'old_record', row_to_json(OLD)
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_status_endorsed on public.endorsement_applications;
create trigger trg_notify_status_endorsed
  after update on public.endorsement_applications
  for each row
  execute function public.tg_notify_status_endorsed();

-- ---------------------------------------------------------------------
-- 4. Lock down helper to admin only
-- ---------------------------------------------------------------------
revoke all on function public._get_webhook_secret()       from public, anon, authenticated;
revoke all on function public.tg_notify_new_application() from public, anon, authenticated;
revoke all on function public.tg_notify_status_endorsed() from public, anon, authenticated;

-- =====================================================================
-- ONE-TIME MANUAL STEP (run separately, do NOT include in this migration):
--
--   Create the webhook secret in Vault. Replace the placeholder with a
--   random string of 32+ characters. Keep a copy somewhere secure;
--   you'll paste the same value into the Edge Function env vars.
--
--   select vault.create_secret(
--     'PASTE_RANDOM_32_CHAR_TOKEN_HERE',
--     'webhook_secret',
--     'Shared secret for endorsement notification webhooks'
--   );
--
--   To rotate later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'webhook_secret'),
--     'NEW_RANDOM_TOKEN'
--   );
-- =====================================================================
