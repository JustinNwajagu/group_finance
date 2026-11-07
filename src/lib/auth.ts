import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getIdentity } from "../../cursor/identity";
import { sql } from "./db";
import type { AppRole, AppUser } from "./types";

export type ViewerContext = {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  access: AppUser | null;
};

async function findBySub(sub: string): Promise<AppUser | null> {
  const rows = await sql<AppUser>(
    "select id, cursor_sub, email, name, role, created_at::text from app_users where cursor_sub = $1 limit 1",
    [sub],
  );
  return rows[0] ?? null;
}

async function findByEmail(email: string): Promise<AppUser | null> {
  const rows = await sql<AppUser>(
    "select id, cursor_sub, email, name, role, created_at::text from app_users where lower(email) = lower($1) limit 1",
    [email],
  );
  return rows[0] ?? null;
}

async function adminCount(): Promise<number> {
  const rows = await sql<{ count: string }>(
    "select count(*)::text as count from app_users where role = 'admin'",
  );
  return Number(rows[0]?.count ?? 0);
}

async function createUser(input: {
  cursor_sub: string | null;
  email: string;
  name: string;
  role: AppRole;
}): Promise<AppUser> {
  const rows = await sql<AppUser>(
    `insert into app_users (cursor_sub, email, name, role)
     values ($1, $2, $3, $4)
     returning id, cursor_sub, email, name, role, created_at::text`,
    [input.cursor_sub, input.email, input.name, input.role],
  );
  return rows[0]!;
}

export async function resolveViewer(): Promise<ViewerContext | null> {
  const identity = await getIdentity(await headers());
  if (!identity.verified) return null;
  if (identity.kind === "key") return null;

  const email = identity.email.trim() || `${identity.sub}@users.local`;
  const name = identity.name.trim() || email;

  let access = await findBySub(identity.sub);

  if (!access && identity.email.trim()) {
    const invited = await findByEmail(identity.email);
    if (invited && !invited.cursor_sub) {
      const linked = await sql<AppUser>(
        `update app_users
         set cursor_sub = $1, name = case when name = '' then $2 else name end
         where id = $3
         returning id, cursor_sub, email, name, role, created_at::text`,
        [identity.sub, name, invited.id],
      );
      access = linked[0] ?? invited;
    }
  }

  if (!access) {
    if ((await adminCount()) === 0) {
      access = await createUser({
        cursor_sub: identity.sub,
        email,
        name,
        role: "admin",
      });
    } else {
      access = await createUser({
        cursor_sub: identity.sub,
        email,
        name,
        role: "pending",
      });
    }
  }

  return {
    sub: identity.sub,
    email: access.email || email,
    name: access.name || name,
    simulated: identity.simulated === true,
    access,
  };
}

export async function requireSignedIn(): Promise<ViewerContext> {
  const viewer = await resolveViewer();
  if (!viewer) {
    redirect("/signed-out");
  }
  return viewer;
}

export async function requireAccess(): Promise<ViewerContext & { access: AppUser }> {
  const viewer = await requireSignedIn();
  if (!viewer.access || viewer.access.role === "pending") {
    redirect("/pending");
  }
  return viewer as ViewerContext & { access: AppUser };
}

export async function requireAdmin(): Promise<ViewerContext & { access: AppUser }> {
  const viewer = await requireAccess();
  if (viewer.access.role !== "admin") {
    redirect("/members");
  }
  return viewer;
}

export function isAdmin(viewer: ViewerContext): boolean {
  return viewer.access?.role === "admin";
}
