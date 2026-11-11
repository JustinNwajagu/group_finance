"use client";

import { useState } from "react";
import { saveRegulationsAction } from "@/app/actions/regulations";
import { FormBusyMarker } from "@/components/action-form";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import type {
  RegulationSection,
  RegulationSignatory,
  RegulationsDoc,
} from "@/lib/regulations";

type EditableSection = RegulationSection;
type EditableSignatory = RegulationSignatory;

export function RegulationsEditor({ doc }: { doc: RegulationsDoc }) {
  const [title, setTitle] = useState(doc.title);
  const [intro, setIntro] = useState(doc.intro);
  const [sections, setSections] = useState<EditableSection[]>(
    doc.sections.map((s) => ({ ...s, items: [...s.items] })),
  );
  const [signatories, setSignatories] = useState<EditableSignatory[]>(
    doc.signatories.map((s) => ({ ...s })),
  );

  function updateSection(index: number, patch: Partial<EditableSection>) {
    setSections((prev) =>
      prev.map((section, i) => (i === index ? { ...section, ...patch } : section)),
    );
  }

  function updateSignatory(index: number, patch: Partial<EditableSignatory>) {
    setSignatories((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <section className="panel">
      <h2>Edit regulations</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Admins can revise existing rules or add new ones. Members see the saved
        text on this page.
      </p>
      <form action={saveRegulationsAction} className="form-grid">
        <FormBusyMarker />
        <input type="hidden" name="section_count" value={sections.length} />
        <input type="hidden" name="signatory_count" value={signatories.length} />

        <label className="field">
          Title
          <input
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Intro
          <textarea
            name="intro"
            rows={3}
            required
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
          />
        </label>

        <div className="stack" style={{ gap: "0.85rem" }}>
          {sections.map((section, index) => (
            <div key={section.id || `section-${index}`} className="regulations-edit-card">
              <input type="hidden" name={`section_id_${index}`} value={section.id} />
              <div className="regulations-edit-card-head">
                <strong>Rule {index + 1}</strong>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setSections((prev) => prev.filter((_, i) => i !== index))
                  }
                  disabled={sections.length <= 1}
                >
                  Remove
                </button>
              </div>
              <label className="field">
                Section title
                <input
                  name={`section_title_${index}`}
                  required
                  value={section.title}
                  onChange={(e) =>
                    updateSection(index, { title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Rules (one per line)
                <textarea
                  name={`section_items_${index}`}
                  rows={4}
                  required
                  value={section.items.join("\n")}
                  onChange={(e) =>
                    updateSection(index, {
                      items: e.target.value.split(/\r?\n/),
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            setSections((prev) => [
              ...prev,
              {
                id: `new-${Date.now()}`,
                title: `${prev.length + 1}. New rule`,
                items: [""],
              },
            ])
          }
        >
          Add rule
        </button>

        <div className="stack" style={{ gap: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Signatories</h3>
          {signatories.map((row, index) => (
            <div key={`${row.role}-${index}`} className="form-grid two">
              <label className="field">
                Role
                <input
                  name={`signatory_role_${index}`}
                  required
                  value={row.role}
                  onChange={(e) =>
                    updateSignatory(index, { role: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Name
                <input
                  name={`signatory_name_${index}`}
                  required
                  value={row.name}
                  onChange={(e) =>
                    updateSignatory(index, { name: e.target.value })
                  }
                />
              </label>
            </div>
          ))}
        </div>

        <FormPendingStatus message="Saving regulations…" />
        <PendingSubmitButton
          idleLabel="Save regulations"
          pendingLabel="Saving…"
        />
      </form>
    </section>
  );
}
