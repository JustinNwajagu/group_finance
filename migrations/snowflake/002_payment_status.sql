alter table payments
  add column if not exists status varchar not null default 'pledge';

-- Snowflake: add check if missing via separate statement when needed.
create index if not exists payments_status_idx on payments (status);
