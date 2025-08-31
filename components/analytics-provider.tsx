"use client";

import { useAnalytics } from "@/hooks/use-analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  // This just initializes the analytics hook
  useAnalytics();

  return <>{children}</>;
}
