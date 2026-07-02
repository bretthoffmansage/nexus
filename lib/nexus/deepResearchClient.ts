import { api } from "@/convex/_generated/api";
import { nexusChat } from "@/lib/nexus/p5Client";

/** Client boundary for the Deep Research page handoff. */
export const nexusDeepResearch = {
  submitDeepResearch: api.deepResearch.submitDeepResearch,
  listMyDeepResearchTasks: api.deepResearch.listMyDeepResearchTasks,
  getMyTask: nexusChat.getMyTask,
  getMyTaskResult: nexusChat.getMyTaskResult,
  listMyTaskSources: nexusChat.listMyTaskSources,
  listMyTaskProgress: nexusChat.listMyTaskProgress,
  cancelTask: nexusChat.cancelTask,
  connectorStatus: nexusChat.connectorStatus,
} as const;
