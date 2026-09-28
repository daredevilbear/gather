import { useTranslation } from "next-i18next/pages";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { data, error } = useWidgetAPI(service.widget, "summary");
  return (
    <Container service={service} error={error}>
      <Block label="velociraptor.total" value={data ? t("common.number", { value: data.total }) : undefined} />
      <Block label="velociraptor.recent" value={data ? t("common.number", { value: data.recent }) : undefined} />
      <Block label="velociraptor.stale" value={data ? t("common.number", { value: data.stale }) : undefined} />
    </Container>
  );
}
