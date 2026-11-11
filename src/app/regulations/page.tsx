import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { RegulationsEditor } from "@/components/regulations-editor";
import { requireAccess, isAdmin } from "@/lib/auth";
import { getRegulations } from "@/lib/store";

export const instant = false;

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const params = await searchParams;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  const doc = await getRegulations();

  return (
    <AppShell viewer={viewer} active="regulations">
      <div className="page-head">
        <div>
          <h1>{doc.title}</h1>
          <p>{doc.intro}</p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          saved: "Regulations updated.",
        }}
      />

      <div className="stack regulations-stack">
        {doc.sections.map((section) => (
          <section key={section.id} className="panel regulations-section">
            <h2>{section.title}</h2>
            <ul className="regulations-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="panel regulations-signatories">
          {doc.signatories.map((signatory) => (
            <div key={`${signatory.role}-${signatory.name}`} className="signatory">
              <span className="signatory-name">{signatory.name}</span>
              <span className="signatory-role">{signatory.role}</span>
            </div>
          ))}
        </footer>

        {admin ? <RegulationsEditor doc={doc} /> : null}
      </div>
    </AppShell>
  );
}
