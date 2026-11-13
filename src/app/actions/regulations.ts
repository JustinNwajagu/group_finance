"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { RegulationSection, RegulationSignatory } from "@/lib/regulations";
import { saveRegulations } from "@/lib/store";

function slugId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base ? `rule-${base}` : `rule-${index + 1}`;
}

export async function saveRegulationsAction(
  formData: FormData,
): Promise<void> {
  const viewer = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  const sectionCount = Number(formData.get("section_count") ?? 0);

  if (!title) {
    redirect("/regulations?error=" + encodeURIComponent("Title is required."));
  }
  if (!intro) {
    redirect("/regulations?error=" + encodeURIComponent("Intro is required."));
  }
  if (!Number.isFinite(sectionCount) || sectionCount < 1) {
    redirect(
      "/regulations?error=" +
        encodeURIComponent("Add at least one regulation section."),
    );
  }

  const sections: RegulationSection[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const sectionTitle = String(formData.get(`section_title_${i}`) ?? "").trim();
    const itemsRaw = String(formData.get(`section_items_${i}`) ?? "");
    const items = itemsRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const existingId = String(formData.get(`section_id_${i}`) ?? "").trim();
    if (!sectionTitle && items.length === 0) continue;
    if (!sectionTitle) {
      redirect(
        "/regulations?error=" +
          encodeURIComponent(`Section ${i + 1} needs a title.`),
      );
    }
    if (items.length === 0) {
      redirect(
        "/regulations?error=" +
          encodeURIComponent(`“${sectionTitle}” needs at least one rule line.`),
      );
    }
    sections.push({
      id: existingId || slugId(sectionTitle, i),
      title: sectionTitle,
      items,
    });
  }

  if (sections.length === 0) {
    redirect(
      "/regulations?error=" +
        encodeURIComponent("Add at least one regulation section."),
    );
  }

  const signatoryCount = Number(formData.get("signatory_count") ?? 0);
  const signatories: RegulationSignatory[] = [];
  for (let i = 0; i < signatoryCount; i++) {
    const role = String(formData.get(`signatory_role_${i}`) ?? "").trim();
    const name = String(formData.get(`signatory_name_${i}`) ?? "").trim();
    if (!role && !name) continue;
    signatories.push({
      role: role || "Signatory",
      name: name || "—",
    });
  }

  if (signatories.length === 0) {
    redirect(
      "/regulations?error=" +
        encodeURIComponent("Keep at least one signatory."),
    );
  }

  try {
    await saveRegulations({
      title,
      intro,
      sections,
      signatories,
      updated_by: viewer.email,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save regulations.";
    redirect("/regulations?error=" + encodeURIComponent(message));
  }

  revalidatePath("/regulations");
  redirect("/regulations?ok=saved");
}
