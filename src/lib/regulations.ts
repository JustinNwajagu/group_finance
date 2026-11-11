/** Official class financial regulations — source text from the organisation. */

export type RegulationSection = {
  title: string;
  items: string[];
};

export const REGULATIONS_INTRO =
  "As agreed by all members, the following shall guide our financial responsibilities to one another:";

export const REGULATIONS_TITLE = "Financial Regulations of the Class";

export const REGULATION_SECTIONS: RegulationSection[] = [
  {
    title: "1. Bereavement — Loss of a Parent",
    items: [
      "When a member loses his father or mother, the class is obligated to attend the funeral.",
      "The class shall also present the bereaved member with a cash sum of not less than ₦100,000 (can be more but not less).",
    ],
  },
  {
    title: "2. Wedding",
    items: [
      "When a member is having his wedding, whether church wedding or traditional wedding, and invites the class, the class is obliged to attend.",
      "The class shall present the couple with a cash sum of not less than ₦100,000 (can be more but not less), and we can give for one wedding at a time.",
    ],
  },
  {
    title: "3. Diaconate Ordination",
    items: [
      "When a member is having his diaconate ordination, the class is obliged to attend.",
      "The class shall present him with a cash sum of not less than ₦100,000 (can be more but not less).",
    ],
  },
  {
    title: "4. Priestly Ordination",
    items: [
      "When a member is having his priestly ordination, the class is obliged to attend.",
      "The class shall present him with a cash sum of not less than ₦200,000 (can be more but not less).",
    ],
  },
  {
    title: "5. Welfare of a Sick Member",
    items: [
      "When a member is seriously sick, not just having fever or a minor illness, the class is obliged to do a free-will donation.",
      "The class will also present a token to help him out.",
    ],
  },
  {
    title: "6. Condition for Benefit",
    items: [
      "Anyone who is not active in the financial responsibilities of the class will not be contributed for on any occasion.",
    ],
  },
  {
    title: "7. Notification of Financial Difficulty",
    items: [
      "If a member has a financial issue which prevents him from meeting his financial responsibility to the class, he should notify the President especially if he has been active.",
    ],
  },
];

export const REGULATION_SIGNATORIES = [
  { role: "President", name: "Udeoba Donald" },
  { role: "Secretary", name: "Udeh Stephen" },
] as const;
