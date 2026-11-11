import Link from "next/link";
import { DUES_MONTH_LABELS } from "@/lib/dues-months";
import { formatMoney } from "@/lib/format";
import type { DuesYearBoard } from "@/lib/types";

export function DuesYearTable({
  board,
  emptyLabel = "No members match that filter.",
}: {
  board: DuesYearBoard;
  emptyLabel?: string;
}) {
  if (board.rows.length === 0) {
    return <div className="hero-empty">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap dues-table-wrap">
      <table className="data dues-grid">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Member</th>
            {DUES_MONTH_LABELS.map((label) => (
              <th key={label} className="dues-month">
                {label}
              </th>
            ))}
            <th className="num">Paid</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, index) => (
            <tr key={row.member.id}>
              <td className="num muted">{index + 1}</td>
              <td>
                <Link className="row-link" href={`/members/${row.member.id}`}>
                  {row.member.name}
                </Link>
              </td>
              {row.months_paid.map((paid, i) => (
                <td
                  key={DUES_MONTH_LABELS[i]}
                  className={
                    paid
                      ? "dues-month dues-paid dues-month-tip"
                      : "dues-month dues-month-tip"
                  }
                  data-tip={
                    paid
                      ? `${DUES_MONTH_LABELS[i]} · Paid`
                      : `${DUES_MONTH_LABELS[i]} · Unpaid`
                  }
                >
                  <span className="dues-month-mark" aria-hidden="true">
                    {paid ? "●" : "·"}
                  </span>
                  <span className="sr-only">
                    {paid
                      ? `${DUES_MONTH_LABELS[i]} paid`
                      : `${DUES_MONTH_LABELS[i]} unpaid`}
                  </span>
                </td>
              ))}
              <td className="num">
                {row.months_count}/12
                <span className="sr-only">
                  {" "}
                  ({formatMoney(row.amount_paid)})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
