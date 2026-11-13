"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MemberFilter } from "@/components/member-filter";
import { formatDuesCount } from "@/lib/dues-months";
import type { ExcoSeatView, MemberContribution } from "@/lib/types";

export function HomeRosterList({
  members,
  contributionCount,
  duesYearCount,
  excoByMemberEntries,
}: {
  members: MemberContribution[];
  contributionCount: number;
  duesYearCount: number;
  /** Serializable map entries [memberId, seat]. */
  excoByMemberEntries: Array<[number, ExcoSeatView]>;
}) {
  const [q, setQ] = useState("");
  const excoByMember = useMemo(
    () => new Map(excoByMemberEntries),
    [excoByMemberEntries],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle),
    );
  }, [members, q]);

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Roster</h2>
        <p className="panel-heading-meta">
          Members <strong>{members.length}</strong>
          {" · "}
          Contributions count <strong>{contributionCount}</strong>
          {" · "}
          Dues count <strong>{duesYearCount}</strong>
        </p>
      </div>

      <MemberFilter value={q} onChange={setQ} />

      {filtered.length === 0 ? (
        <div className="hero-empty">
          {q.trim()
            ? "No members match that filter."
            : "No members yet. Admins can add or import the first names."}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Member</th>
                <th className="num">Contributions</th>
                <th className="num">Dues</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, index) => {
                const seat = excoByMember.get(m.id);
                return (
                  <tr key={m.id}>
                    <td className="num muted">{index + 1}</td>
                    <td>
                      <Link className="row-link" href={`/members/${m.id}`}>
                        {m.name}
                      </Link>
                      {seat ? (
                        <span
                          className={
                            seat.grants_admin
                              ? "badge badge-admin"
                              : "badge badge-exco"
                          }
                          style={{ marginLeft: "0.45rem" }}
                        >
                          {seat.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="num">
                      {m.contribution_count}
                      <span className="muted">/{m.payment_count}</span>
                    </td>
                    <td className="num">
                      {m.dues_years_count > 0 ? (
                        <>
                          {formatDuesCount(m.dues_count)}
                          <span className="muted">/{m.dues_years_count}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
