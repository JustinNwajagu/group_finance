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

create table if not exists payment_requests (
  id serial primary key,
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  deadline date not null,
  concluded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_requests_open_idx
  on payment_requests (concluded_at);

create table if not exists payments (
  id serial primary key,
  payment_request_id integer not null references payment_requests (id),
  member_id integer not null references members (id),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_date date,
  status text not null default 'pledge' check (status in ('pledge', 'paid')),
  created_at timestamptz not null default now(),
  unique (payment_request_id, member_id)
);

create index if not exists payments_member_id_idx on payments (member_id);
create index if not exists payments_request_id_idx on payments (payment_request_id);
create index if not exists payments_status_idx on payments (status);
