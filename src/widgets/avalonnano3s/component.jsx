import { useTranslation } from "next-i18next/pages";

import { difficulty, measurement, numeric } from "../bitaxe/metrics";
import styles from "../bitaxe/styles.module.css";

import { uptime } from "./display";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { data, error } = useWidgetAPI(service.widget, "info", undefined, { refreshInterval: 10000 });
  if (error) return <Container service={service} error={error} />;
  const value = (key, digits, unit, divisor) => (data ? measurement(data[key], digits, unit, divisor) : undefined);

  return (
    <div className={styles.card}>
      <Container service={service}>
        <Block
          label="avalonnano3s.hashrate"
          value={value("hashRate", 2, " TH/s", 1000000)}
          highlightValue={numeric(data?.hashRate) === null ? undefined : numeric(data?.hashRate) / 1000000}
        />
        <Block
          label="avalonnano3s.averagehashrate"
          value={value("averageHashRate", 2, " TH/s", 1000000)}
          highlightValue={
            numeric(data?.averageHashRate) === null ? undefined : numeric(data?.averageHashRate) / 1000000
          }
        />
        <Block
          label="avalonnano3s.temperature"
          value={
            data ? (
              <>
                <span>{measurement(data.temperature, 1, " °C")}</span>
                <span className={styles.secondary}>
                  {t("avalonnano3s.max")}: {measurement(data.maxTemperature, 1, " °C")}
                </span>
              </>
            ) : undefined
          }
          highlightValue={numeric(data?.temperature)}
        />
        <Block
          label="avalonnano3s.fan"
          value={data ? `${measurement(data.fanRpm, 0, " RPM")} (${measurement(data.fanSpeed, 0, "%")})` : undefined}
          highlightValue={numeric(data?.fanRpm)}
        />
        <Block label="avalonnano3s.accepted" value={value("accepted", 0)} highlightValue={numeric(data?.accepted)} />
        <Block
          label="avalonnano3s.rejectedshares"
          value={
            data ? (
              <>
                <span>{measurement(data.rejectedSharePercentage, 2, "%")}</span>
                <span className={styles.secondary}>
                  {measurement(data.rejected, 0)} {t("avalonnano3s.rejected")}
                </span>
              </>
            ) : undefined
          }
          highlightValue={numeric(data?.rejectedSharePercentage)}
        />
        <Block
          label="avalonnano3s.hardwareerrors"
          value={value("hardwareErrors", 0)}
          highlightValue={numeric(data?.hardwareErrors)}
        />
        <Block label="avalonnano3s.bestdifficulty" value={data ? difficulty(data.bestDifficulty) : undefined} />
        <Block label="avalonnano3s.uptime" value={data ? uptime(data.uptime) : undefined} />
      </Container>
      {data?.updatedAt && (
        <p className={styles.updated}>
          {t("avalonnano3s.updated")}{" "}
          <time dateTime={new Date(data.updatedAt).toISOString()}>{new Date(data.updatedAt).toLocaleTimeString()}</time>
        </p>
      )}
    </div>
  );
}
