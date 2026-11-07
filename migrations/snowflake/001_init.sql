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

create table if not exists payment_requests (
  id integer identity(1, 1) primary key,
  title varchar not null,
  amount number(12, 2) not null,
  deadline date not null,
  concluded_at timestamp_tz,
  created_at timestamp_tz not null default current_timestamp(),
  constraint payment_requests_amount_chk check (amount >= 0)
);

create table if not exists payments (
  id integer identity(1, 1) primary key,
  payment_request_id integer not null references payment_requests (id),
  member_id integer not null references members (id),
  amount number(12, 2) not null,
  payment_date date,
  status varchar not null default 'pledge',
  created_at timestamp_tz not null default current_timestamp(),
  constraint payments_amount_chk check (amount >= 0),
  constraint payments_status_chk check (status in ('pledge', 'paid')),
  constraint payments_request_member_uk unique (payment_request_id, member_id)
);

create index if not exists payments_member_id_idx on payments (member_id);
create index if not exists payments_request_id_idx on payments (payment_request_id);
create index if not exists payments_status_idx on payments (status);
