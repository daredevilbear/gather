import { DateTime } from "luxon";
import { useTranslation } from "next-i18next/pages";
import { useEffect, useId } from "react";

import Error from "../../../components/services/widget/error";
import useWidgetAPI from "../../../utils/proxy/use-widget-api";

export default function Integration({ config, params, setEvents, hideErrors = false, timezone }) {
  const integrationId = useId();
  const prefix = `radarr:${integrationId}:`;
  const { t } = useTranslation();
  const { data: radarrData, error: radarrError } = useWidgetAPI(config, "calendar", {
    ...params,
    ...(config?.params ?? {}),
  });
  useEffect(() => {
    if (!Array.isArray(radarrData) || radarrError) {
      return;
    }

    const eventsToAdd = {};

    radarrData?.forEach((event) => {
      if (config?.missingOnly && (!event.monitored || event.hasFile)) return;
      const releaseDate = (value) =>
        DateTime.fromISO(config?.missingOnly ? value.slice(0, 10) : value, { zone: timezone });
      const cinemaTitle = `${event.title} - ${t("calendar.inCinemas")}`;
      const physicalTitle = `${event.title} - ${t("calendar.physicalRelease")}`;
      const digitalTitle = `${event.title} - ${t("calendar.digitalRelease")}`;
      const url = config?.baseUrl && event.titleSlug && `${config.baseUrl}/movie/${event.titleSlug}`;

      if (event.inCinemas) {
        eventsToAdd[`${prefix}${event.id ?? event.titleSlug ?? event.title}:${cinemaTitle}`] = {
          title: cinemaTitle,
          date: releaseDate(event.inCinemas),
          color: config?.color ?? "amber",
          isCompleted: event.hasFile,
          additional: "",
          url,
        };
      }

      if (event.physicalRelease) {
        eventsToAdd[`${prefix}${event.id ?? event.titleSlug ?? event.title}:${physicalTitle}`] = {
          title: physicalTitle,
          date: releaseDate(event.physicalRelease),
          color: config?.color ?? "cyan",
          isCompleted: event.hasFile,
          additional: "",
          url,
        };
      }

      if (event.digitalRelease) {
        eventsToAdd[`${prefix}${event.id ?? event.titleSlug ?? event.title}:${digitalTitle}`] = {
          title: digitalTitle,
          date: releaseDate(event.digitalRelease),
          color: config?.color ?? "emerald",
          isCompleted: event.hasFile,
          additional: "",
          url,
        };
      }
    });

    setEvents((prevEvents) => ({
      ...Object.fromEntries(Object.entries(prevEvents).filter(([key]) => !key.startsWith(prefix))),
      ...eventsToAdd,
    }));
  }, [radarrData, radarrError, config, setEvents, t, prefix, timezone]);

  const error = radarrError ?? radarrData?.error;
  return error && !hideErrors && <Error error={{ message: `${config.type}: ${error.message ?? error}` }} />;
}
