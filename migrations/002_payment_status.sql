alter table payments
  add column if not exists status text not null default 'pledge';

create index if not exists payments_status_idx on payments (status);
