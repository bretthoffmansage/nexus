import { api } from "@/convex/_generated/api";

/** Client boundary for the read-only Nexus Skills catalog. */
export const nexusSkills = {
  listCatalog: api.skillsCatalog.listSkillsCatalog,
} as const;
