
-- Table
create table public.purchases (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references auth.users(id) on delete cascade,
  product                text        not null check (product in (
                                       'fat_loss_blueprint',
                                       'muscle_gain',
                                       'glute_builder',
                                       'ai_membership'
                                     )),
  status                 text        not null default 'active' check (status in (
                                       'active',
                                       'canceled',
                                       'refunded'
                                     )),
  stripe_session_id      text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Indexes
create index purchases_user_id_idx
  on public.purchases(user_id);

create index purchases_stripe_subscription_id_idx
  on public.purchases(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- RLS
alter table public.purchases enable row level security;

create policy "Users can view own purchases"
  on public.purchases
  for select
  using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();
