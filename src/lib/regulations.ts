/** Official class financial regulations — defaults from the organisation. */

export type RegulationSection = {
  id: string;
  title: string;
  items: string[];
};

export type RegulationSignatory = {
  role: string;
  name: string;
};

export type RegulationsDoc = {
  title: string;
  intro: string;
  sections: RegulationSection[];
  signatories: RegulationSignatory[];
  updated_at: string | null;
  updated_by: string | null;
};

export const REGULATIONS_INTRO =
  "As agreed by all members, the following shall guide our financial responsibilities to one another:";

export const REGULATIONS_TITLE = "Financial Regulations of the Class";

export const REGULATION_SECTIONS: RegulationSection[] = [
  {
    id: "bereavement",
    title: "1. Bereavement — Loss of a Parent",
    items: [
      "When a member loses his father or mother, the class is obligated to attend the funeral.",
      "The class shall also present the bereaved member with a cash sum of not less than ₦100,000 (can be more but not less).",
    ],
  },
  {
    id: "wedding",
    title: "2. Wedding",
    items: [
      "When a member is having his wedding, whether church wedding or traditional wedding, and invites the class, the class is obliged to attend.",
      "The class shall present the couple with a cash sum of not less than ₦100,000 (can be more but not less), and we can give for one wedding at a time.",
    ],
  },
  {
    id: "diaconate",
    title: "3. Diaconate Ordination",
    items: [
      "When a member is having his diaconate ordination, the class is obliged to attend.",
      "The class shall present him with a cash sum of not less than ₦100,000 (can be more but not less).",
    ],
  },
  {
    id: "priestly",
    title: "4. Priestly Ordination",
    items: [
      "When a member is having his priestly ordination, the class is obliged to attend.",
      "The class shall present him with a cash sum of not less than ₦200,000 (can be more but not less).",
    ],
  },
  {
    id: "sick",
    title: "5. Welfare of a Sick Member",
    items: [
      "When a member is seriously sick, not just having fever or a minor illness, the class is obliged to do a free-will donation.",
      "The class will also present a token to help him out.",
    ],
  },
  {
    id: "condition",
    title: "6. Condition for Benefit",
    items: [
      "Anyone who is not active in the financial responsibilities of the class will not be contributed for on any occasion.",
    ],
  },
  {
    id: "difficulty",
    title: "7. Notification of Financial Difficulty",
    items: [
      "If a member has a financial issue which prevents him from meeting his financial responsibility to the class, he should notify the President especially if he has been active.",
    ],
  },
];

export const REGULATION_SIGNATORIES: RegulationSignatory[] = [
  { role: "President", name: "Mr Udeoba Donald" },
  { role: "Secretary", name: "Fr. Udeh Stephen" },
];

export function defaultRegulationsDoc(): RegulationsDoc {
  return {
    title: REGULATIONS_TITLE,
    intro: REGULATIONS_INTRO,
    sections: REGULATION_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      items: [...s.items],
    })),
    signatories: REGULATION_SIGNATORIES.map((s) => ({ ...s })),
    updated_at: null,
    updated_by: null,
  };
}

export function normalizeRegulationsDoc(
  raw: Partial<RegulationsDoc> | Record<string, unknown> | null | undefined,
): RegulationsDoc {
  const fallback = defaultRegulationsDoc();
  if (!raw || typeof raw !== "object") return fallback;

  const sectionsRaw = Array.isArray((raw as RegulationsDoc).sections)
    ? (raw as RegulationsDoc).sections
    : [];
  const sections: RegulationSection[] = sectionsRaw
    .map((section, index) => {
      if (!section || typeof section !== "object") return null;
      const title = String(section.title ?? "").trim();
      const items = Array.isArray(section.items)
        ? section.items
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
        : [];
      if (!title && items.length === 0) return null;
      const id =
        String(section.id ?? "").trim() ||
        `rule-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section"}`;
      return { id, title: title || `Rule ${index + 1}`, items };
    })
    .filter((s): s is RegulationSection => s != null);

  const signatoriesRaw = Array.isArray((raw as RegulationsDoc).signatories)
    ? (raw as RegulationsDoc).signatories
    : [];
  const signatories = signatoriesRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const role = String(row.role ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (!role && !name) return null;
      return { role: role || "Signatory", name: name || "—" };
    })
    .filter((s): s is RegulationSignatory => s != null);

  return {
    title:
      String((raw as RegulationsDoc).title ?? "").trim() || fallback.title,
    intro:
      String((raw as RegulationsDoc).intro ?? "").trim() || fallback.intro,
    sections: sections.length > 0 ? sections : fallback.sections,
    signatories: signatories.length > 0 ? signatories : fallback.signatories,
    updated_at: ((raw as RegulationsDoc).updated_at as string | null) ?? null,
    updated_by: ((raw as RegulationsDoc).updated_by as string | null) ?? null,
  };
}
