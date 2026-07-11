/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as appMeta from "../appMeta.js";
import type * as connectorAttachments from "../connectorAttachments.js";
import type * as connectorAuthStore from "../connectorAuthStore.js";
import type * as connectorReads from "../connectorReads.js";
import type * as connectorRegistry from "../connectorRegistry.js";
import type * as connectorTasks from "../connectorTasks.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as deepResearch from "../deepResearch.js";
import type * as diagnostics from "../diagnostics.js";
import type * as http from "../http.js";
import type * as identityAudit from "../identityAudit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bootstrap from "../lib/bootstrap.js";
import type * as lib_calendarProjection from "../lib/calendarProjection.js";
import type * as lib_calendarScheduleConfig from "../lib/calendarScheduleConfig.js";
import type * as lib_calendarScheduledTools from "../lib/calendarScheduledTools.js";
import type * as lib_calendarTimezone from "../lib/calendarTimezone.js";
import type * as lib_systemStatus from "../lib/systemStatus.js";
import type * as lib_connectorAuth from "../lib/connectorAuth.js";
import type * as lib_conversationContext from "../lib/conversationContext.js";
import type * as lib_conversationContextConfig from "../lib/conversationContextConfig.js";
import type * as lib_deepResearchConfig from "../lib/deepResearchConfig.js";
import type * as lib_deepResearchRequestCompose from "../lib/deepResearchRequestCompose.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_libraryDropzoneConfig from "../lib/libraryDropzoneConfig.js";
import type * as lib_libraryFilename from "../lib/libraryFilename.js";
import type * as lib_libraryProjection from "../lib/libraryProjection.js";
import type * as lib_librarySha256 from "../lib/librarySha256.js";
import type * as lib_nexusSkillsCatalog from "../lib/nexusSkillsCatalog.js";
import type * as lib_notesConfig from "../lib/notesConfig.js";
import type * as lib_ownership from "../lib/ownership.js";
import type * as lib_p5config from "../lib/p5config.js";
import type * as lib_p5writes from "../lib/p5writes.js";
import type * as lib_p6config from "../lib/p6config.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_queue from "../lib/queue.js";
import type * as lib_taskStatus from "../lib/taskStatus.js";
import type * as lib_taskTransitions from "../lib/taskTransitions.js";
import type * as lib_userProvisioning from "../lib/userProvisioning.js";
import type * as libraryDocuments from "../libraryDocuments.js";
import type * as libraryUpload from "../libraryUpload.js";
import type * as messages from "../messages.js";
import type * as notes from "../notes.js";
import type * as roles from "../roles.js";
import type * as scheduledEventDispatch from "../scheduledEventDispatch.js";
import type * as scheduledEvents from "../scheduledEvents.js";
import type * as skillsCatalog from "../skillsCatalog.js";
import type * as taskProgress from "../taskProgress.js";
import type * as taskResults from "../taskResults.js";
import type * as taskSources from "../taskSources.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";
import type * as webhookIngest from "../webhookIngest.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  appMeta: typeof appMeta;
  connectorAttachments: typeof connectorAttachments;
  connectorAuthStore: typeof connectorAuthStore;
  connectorReads: typeof connectorReads;
  connectorRegistry: typeof connectorRegistry;
  connectorTasks: typeof connectorTasks;
  conversations: typeof conversations;
  crons: typeof crons;
  deepResearch: typeof deepResearch;
  diagnostics: typeof diagnostics;
  http: typeof http;
  identityAudit: typeof identityAudit;
  "lib/auth": typeof lib_auth;
  "lib/bootstrap": typeof lib_bootstrap;
  "lib/calendarProjection": typeof lib_calendarProjection;
  "lib/calendarScheduleConfig": typeof lib_calendarScheduleConfig;
  "lib/calendarScheduledTools": typeof lib_calendarScheduledTools;
  "lib/calendarTimezone": typeof lib_calendarTimezone;
  "lib/systemStatus": typeof lib_systemStatus;
  "lib/connectorAuth": typeof lib_connectorAuth;
  "lib/conversationContext": typeof lib_conversationContext;
  "lib/conversationContextConfig": typeof lib_conversationContextConfig;
  "lib/deepResearchConfig": typeof lib_deepResearchConfig;
  "lib/deepResearchRequestCompose": typeof lib_deepResearchRequestCompose;
  "lib/errors": typeof lib_errors;
  "lib/identity": typeof lib_identity;
  "lib/libraryDropzoneConfig": typeof lib_libraryDropzoneConfig;
  "lib/libraryFilename": typeof lib_libraryFilename;
  "lib/libraryProjection": typeof lib_libraryProjection;
  "lib/librarySha256": typeof lib_librarySha256;
  "lib/nexusSkillsCatalog": typeof lib_nexusSkillsCatalog;
  "lib/notesConfig": typeof lib_notesConfig;
  "lib/ownership": typeof lib_ownership;
  "lib/p5config": typeof lib_p5config;
  "lib/p5writes": typeof lib_p5writes;
  "lib/p6config": typeof lib_p6config;
  "lib/permissions": typeof lib_permissions;
  "lib/queue": typeof lib_queue;
  "lib/taskStatus": typeof lib_taskStatus;
  "lib/taskTransitions": typeof lib_taskTransitions;
  "lib/userProvisioning": typeof lib_userProvisioning;
  libraryDocuments: typeof libraryDocuments;
  libraryUpload: typeof libraryUpload;
  messages: typeof messages;
  notes: typeof notes;
  roles: typeof roles;
  scheduledEventDispatch: typeof scheduledEventDispatch;
  scheduledEvents: typeof scheduledEvents;
  skillsCatalog: typeof skillsCatalog;
  taskProgress: typeof taskProgress;
  taskResults: typeof taskResults;
  taskSources: typeof taskSources;
  tasks: typeof tasks;
  users: typeof users;
  webhookIngest: typeof webhookIngest;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
