import { useTranslation } from "next-i18next/pages";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { data, error } = useWidgetAPI(service.widget, "summary");
  return (
    <Container service={service} error={error}>
      <Block label="wazuh.total" value={data ? t("common.number", { value: data.total }) : undefined} />
      <Block label="wazuh.active" value={data ? t("common.number", { value: data.active }) : undefined} />
      <Block label="wazuh.disconnected" value={data ? t("common.number", { value: data.disconnected }) : undefined} />
      <Block label="wazuh.pending" value={data ? t("common.number", { value: data.pending }) : undefined} />
      <Block
        label="wazuh.never_connected"
        value={data ? t("common.number", { value: data.never_connected }) : undefined}
      />
    </Container>
  );
}
