"use client";

import { useCallback, useEffect, useState } from "react";
import { backendRequest, MeResponse } from "../lib/backendApi";

/** The signed-in account from `GET /me`; null until it loads (or if it fails). */
export function useMe() {
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await backendRequest<MeResponse>("/me"));
    } catch {
      // A sleeping or unreachable backend: the voice UI reports it itself.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { me, setMe, refresh };
}
