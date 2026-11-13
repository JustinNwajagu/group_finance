"use client";

import { useId, useMemo, useState } from "react";
import { saveRegulationsAction } from "@/app/actions/regulations";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ScrollSelect } from "@/components/scroll-select";
import type {
  RegulationSection,
  RegulationSignatory,
  RegulationsDoc,
} from "@/lib/regulations";

type EditableSection = RegulationSection;
type EditableSignatory = RegulationSignatory;
type EditorMode = "edit" | "add" | "details";

export function RegulationsEditor({ doc }: { doc: RegulationsDoc }) {
  const idPrefix = useId().replace(/:/g, "");
  const [title, setTitle] = useState(doc.title);
  const [intro, setIntro] = useState(doc.intro);
  const [sections, setSections] = useState<EditableSection[]>(
    doc.sections.map((s) => ({ ...s, items: [...s.items] })),
  );
  const [signatories, setSignatories] = useState<EditableSignatory[]>(
    doc.signatories.map((s) => ({ ...s })),
  );
  const [mode, setMode] = useState<EditorMode>("edit");
  const [selectedId, setSelectedId] = useState(doc.sections[0]?.id ?? "");
  const [draftNew, setDraftNew] = useState<EditableSection>({
    id: `new-${idPrefix}`,
    title: "",
    items: [""],
  });

  const selectedIndex = useMemo(
    () => sections.findIndex((s) => s.id === selectedId),
    [sections, selectedId],
  );
  const selected =
    selectedIndex >= 0 ? sections[selectedIndex] : sections[0] ?? null;

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

  function removeSelectedRule() {
    if (sections.length <= 1 || selectedIndex < 0) return;
    const next = sections.filter((_, i) => i !== selectedIndex);
    setSections(next);
    setSelectedId(next[Math.max(0, selectedIndex - 1)]?.id ?? "");
  }

  const submitSections =
    mode === "add" ? [...sections, draftNew] : sections;

  return (
    <section className="panel">
      <h2>Edit regulations</h2>
      <p className="muted" style={{ margin: "0 0 0.85rem" }}>
        Choose a rule to revise or delete, add a new rule, or update the page
        title, intro, and signatories.
      </p>
      <form action={saveRegulationsAction} className="form-grid">
        {/* Keep payload fields out of the visible grid so they don't add empty rows. */}
        <div hidden>
          <input
            type="hidden"
            name="section_count"
            value={submitSections.length}
          />
          <input
            type="hidden"
            name="signatory_count"
            value={signatories.length}
          />
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="intro" value={intro} />
          {signatories.map((row, index) => (
            <span key={`hidden-signatory-${index}`}>
              <input
                type="hidden"
                name={`signatory_role_${index}`}
                value={row.role}
              />
              <input
                type="hidden"
                name={`signatory_name_${index}`}
                value={row.name}
              />
            </span>
          ))}
          {submitSections.map((section, index) => (
            <span key={`hidden-section-${section.id || index}`}>
              <input
                type="hidden"
                name={`section_id_${index}`}
                value={section.id}
              />
              <input
                type="hidden"
                name={`section_title_${index}`}
                value={section.title}
              />
              <input
                type="hidden"
                name={`section_items_${index}`}
                value={section.items.join("\n")}
              />
            </span>
          ))}
        </div>

        <label className="field">
          What do you want to change?
          <ScrollSelect
            value={mode}
            onChange={(next) => {
              if (next === "edit" || next === "add" || next === "details") {
                setMode(next);
              }
              if (next === "add") {
                setDraftNew({
                  id: `new-${idPrefix}-${sections.length}`,
                  title: "",
                  items: [""],
                });
              }
            }}
            options={[
              { value: "edit", label: "Edit or delete an existing rule" },
              { value: "add", label: "Add a new rule" },
              {
                value: "details",
                label: "Edit title, intro, or signatories",
              },
            ]}
          />
        </label>

        {mode === "edit" ? (
          <>
            <label className="field">
              Select rule
              <ScrollSelect
                value={selected?.id ?? ""}
                onChange={setSelectedId}
                options={sections.map((section) => ({
                  value: section.id,
                  label: section.title,
                }))}
              />
            </label>

            {selected && selectedIndex >= 0 ? (
              <div className="regulations-edit-card">
                <div className="regulations-edit-card-head">
                  <strong>Editing rule</strong>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={removeSelectedRule}
                    disabled={sections.length <= 1}
                  >
                    Delete rule
                  </button>
                </div>
                <label className="field">
                  Section title
                  <input
                    required
                    value={selected.title}
                    onChange={(e) =>
                      updateSection(selectedIndex, { title: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Rules (one per line)
                  <textarea
                    rows={5}
                    required
                    value={selected.items.join("\n")}
                    onChange={(e) =>
                      updateSection(selectedIndex, {
                        items: e.target.value.split(/\r?\n/),
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "add" ? (
          <div className="regulations-edit-card">
            <div className="regulations-edit-card-head">
              <strong>New rule</strong>
            </div>
            <label className="field">
              Section title
              <input
                required
                value={draftNew.title}
                onChange={(e) =>
                  setDraftNew((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={`${sections.length + 1}. New rule`}
              />
            </label>
            <label className="field">
              Rules (one per line)
              <textarea
                rows={5}
                required
                value={draftNew.items.join("\n")}
                onChange={(e) =>
                  setDraftNew((prev) => ({
                    ...prev,
                    items: e.target.value.split(/\r?\n/),
                  }))
                }
              />
            </label>
          </div>
        ) : null}

        {mode === "details" ? (
          <>
            <label className="field">
              Title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              Intro
              <textarea
                rows={3}
                required
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
              />
            </label>
            <div className="stack" style={{ gap: "0.75rem" }}>
              <h3 style={{ margin: 0 }}>Signatories</h3>
              {signatories.map((row, index) => (
                <div key={`${row.role}-${index}`} className="form-grid two">
                  <label className="field">
                    Role
                    <input
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
          </>
        ) : null}

        <PendingSubmitButton
          idleLabel={
            mode === "add"
              ? "Save new rule"
              : mode === "edit"
                ? "Save rule changes"
                : "Save page details"
          }
          pendingLabel="Saving…"
        />
      </form>
    </section>
  );
}
