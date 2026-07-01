import type { MutationCtx } from "../_generated/server";
import { P5_QUEUE } from "./p5config";

/**
 * Global, deterministic queue sequencing.
 *
 * `queueSequence` is a monotonically increasing integer allocated from a
 * singleton counter row. Convex mutations are transactional with optimistic
 * concurrency control: two mutations that both read-then-write the counter (or
 * both insert the first counter row) conflict on their overlapping read set and
 * Convex automatically retries the loser, so every allocation is unique even
 * under concurrent submission.
 *
 * Order is NEVER derived from client timestamps and the client may never
 * supply or alter a queue position.
 */
const GLOBAL_QUEUE_KEY = "global";

export async function allocateQueueSequence(ctx: MutationCtx): Promise<number> {
  const counter = await ctx.db
    .query("nexusQueueCounter")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_QUEUE_KEY))
    .unique();

  if (!counter) {
    await ctx.db.insert("nexusQueueCounter", { key: GLOBAL_QUEUE_KEY, value: 1 });
    return 1;
  }

  const next = counter.value + 1;
  await ctx.db.patch(counter._id, { value: next });
  return next;
}

/** The default priority every user-created task starts at (server-owned). */
export function defaultQueuePriority(): number {
  return P5_QUEUE.defaultPriority;
}
