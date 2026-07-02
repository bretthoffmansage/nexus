"use client";

import { useEffect, useState } from "react";
import type { NexusResearchModel } from "@/lib/nexus/deepResearchModelCatalog";

/** Fetch the research-compatible model catalog once (credential stays server-side). */
export function useDeepResearchModelCatalog(): {
  models: NexusResearchModel[];
  loading: boolean;
  error: boolean;
} {
  const [models, setModels] = useState<NexusResearchModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/deep-research/models")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("catalog"))))
      .then((data: { ok?: boolean; models?: NexusResearchModel[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.models)) {
          setModels(data.models);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading, error };
}
