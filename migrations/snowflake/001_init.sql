create table if not exists app_users (
  id integer identity(1, 1) primary key,
  cursor_sub varchar unique,
  email varchar not null,
  name varchar not null default '',
  role varchar not null,
  created_at timestamp_tz not null default current_timestamp(),
  constraint app_users_role_chk check (role in ('admin', 'member', 'pending'))
);

create unique index if not exists app_users_email_lower_idx
  on app_users (lower(email));

create table if not exists members (
  id integer identity(1, 1) primary key,
  name varchar not null,
  email varchar,
  created_at timestamp_tz not null default current_timestamp()
);

create index if not exists members_name_idx on members (lower(name));

create table if not exists payments (
  id integer identity(1, 1) primary key,
  title varchar not null,
  member_id integer not null references members (id),
  amount number(12, 2) not null,
  payment_date date not null,
  created_at timestamp_tz not null default current_timestamp(),
  constraint payments_amount_chk check (amount >= 0)
);

create index if not exists payments_member_id_idx on payments (member_id);
create index if not exists payments_payment_date_idx on payments (payment_date);
