import { useEffect } from "react";
import useSWR from "swr";

import { formatProxyUrl } from "./api-helpers";

import { useFreshnessReporter } from "components/services/freshness";

export default function useWidgetAPI(widget, endpoint, queryParams, swrConfig = {}) {
  const report = useFreshnessReporter();
  const config = { ...swrConfig };
  if (queryParams?.refreshInterval) {
    config.refreshInterval = queryParams.refreshInterval;
  }
  let url = formatProxyUrl(widget, endpoint, queryParams);
  if (endpoint === "") {
    url = null;
  }
  if (report && url) {
    config.onSuccess = (data, key, options) => {
      report(url, data?.error ? "error" : "success", config.refreshInterval);
      swrConfig.onSuccess?.(data, key, options);
    };
    config.onError = (error, key, options) => {
      report(url, "error", config.refreshInterval);
      swrConfig.onError?.(error, key, options);
    };
  }
  const { data, error, mutate } = useSWR(url, config);
  useEffect(() => {
    if (!url || !report) return undefined;
    report(url, "pending", config.refreshInterval);
    return () => report(url, "remove");
  }, [url, report, config.refreshInterval]);
  useEffect(() => {
    if (url && report && (error || data?.error)) report(url, "error", config.refreshInterval);
  }, [url, report, error, data?.error, config.refreshInterval]);
  // make the data error the top-level error
  return { data, error: data?.error ?? error, mutate };
}
