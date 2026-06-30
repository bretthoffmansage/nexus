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
import type * as identityAudit from "../identityAudit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bootstrap from "../lib/bootstrap.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as roles from "../roles.js";
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
  identityAudit: typeof identityAudit;
  "lib/auth": typeof lib_auth;
  "lib/bootstrap": typeof lib_bootstrap;
  "lib/errors": typeof lib_errors;
  "lib/permissions": typeof lib_permissions;
  roles: typeof roles;
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
