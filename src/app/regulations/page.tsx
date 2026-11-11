import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/auth";
import {
  REGULATIONS_INTRO,
  REGULATIONS_TITLE,
  REGULATION_SECTIONS,
} from "@/lib/regulations";

export const instant = false;

export default async function RegulationsPage() {
  await connection();
  const viewer = await requireAccess();

  return (
    <AppShell viewer={viewer} active="regulations">
      <div className="page-head">
        <div>
          <h1>{REGULATIONS_TITLE}</h1>
          <p>{REGULATIONS_INTRO}</p>
        </div>
      </div>

      <div className="stack regulations-stack">
        {REGULATION_SECTIONS.map((section) => (
          <section key={section.title} className="panel regulations-section">
            <h2>{section.title}</h2>
            <ul className="regulations-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
