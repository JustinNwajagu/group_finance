"use client";

import { usePathname } from "next/navigation";
import { setViewAs } from "@/app/actions/auth";
import type { ViewAsMode } from "@/lib/auth";

export function ViewAsSwitch({ viewAs }: { viewAs: ViewAsMode }) {
  const pathname = usePathname() || "/";
  const viewingMember = viewAs === "member";

  return (
    <div className="view-as-switch" role="group" aria-label="View mode">
      <span className="view-as-label">View as</span>
      <form action={setViewAs} className="view-as-form">
        <input type="hidden" name="return_to" value={pathname} />
        <input type="hidden" name="view_as" value="admin" />
        <button
          type="submit"
          className={
            viewingMember ? "view-as-btn" : "view-as-btn is-active"
          }
          aria-pressed={!viewingMember}
        >
          Admin
        </button>
      </form>
      <form action={setViewAs} className="view-as-form">
        <input type="hidden" name="return_to" value={pathname} />
        <input type="hidden" name="view_as" value="member" />
        <button
          type="submit"
          className={
            viewingMember ? "view-as-btn is-active" : "view-as-btn"
          }
          aria-pressed={viewingMember}
        >
          Member
        </button>
      </form>
    </div>
  );
}
