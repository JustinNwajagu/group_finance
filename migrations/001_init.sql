create table if not exists app_users (
  id serial primary key,
  cursor_sub text unique,
  email text not null,
  name text not null default '',
  role text not null check (role in ('admin', 'member', 'pending')),
  created_at timestamptz not null default now()
);

create unique index if not exists app_users_email_lower_idx
  on app_users (lower(email));

create table if not exists members (
  id serial primary key,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists members_name_idx on members (lower(name));

create table if not exists payments (
  id serial primary key,
  title text not null,
  member_id integer not null references members (id),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_date date not null,
  status text not null default 'pledge' check (status in ('pledge', 'paid')),
  created_at timestamptz not null default now()
);

create index if not exists payments_member_id_idx on payments (member_id);
create index if not exists payments_payment_date_idx on payments (payment_date desc);
create index if not exists payments_status_idx on payments (status);
