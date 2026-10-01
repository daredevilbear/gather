import { useTranslation } from "next-i18next/pages";

import { activePool, difficulty, measurement, numeric } from "../bitaxe/metrics";
import styles from "../bitaxe/styles.module.css";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { data, error } = useWidgetAPI(service.widget, "info", undefined, { refreshInterval: 10000 });

  if (error) return <Container service={service} error={error} />;

  const pool = activePool(data || {});
  const value = (key, digits, unit, divisor) => (data ? measurement(data[key], digits, unit, divisor) : undefined);

  return (
    <div className={styles.card}>
      <Container service={service}>
        <Block
          label="nerdaxe.hashrate"
          value={value("hashRate", 2, " GH/s")}
          highlightValue={numeric(data?.hashRate)}
        />
        <Block
          label="nerdaxe.temperature"
          highlightValue={numeric(data?.temp)}
          value={
            data ? (
              <>
                <span>{measurement(data.temp, 1, " °C")}</span>
                <span className={styles.secondary}>VR: {measurement(data.vrTemp, 1, " °C")}</span>
              </>
            ) : undefined
          }
        />
        <Block
          label="nerdaxe.voltage"
          value={value("voltage", 2, " V", 1000)}
          highlightValue={numeric(data?.voltage) === null ? undefined : numeric(data?.voltage) / 1000}
        />
        <Block label="nerdaxe.bestdifficulty" value={data ? difficulty(data.bestDiff) : undefined} />
        <Block
          label="nerdaxe.rejectedshares"
          value={value("rejectedSharePercentage", 2, "%")}
          highlightValue={numeric(data?.rejectedSharePercentage)}
        />
        <Block
          label="nerdaxe.poolping"
          value={data ? (numeric(data.pingRtt) > 0 ? measurement(data.pingRtt, 1, " ms") : "N/A") : undefined}
          highlightValue={numeric(data?.pingRtt)}
        />
        <Block
          label="nerdaxe.fan"
          value={data ? `${measurement(data.fanrpm, 0, " RPM")} (${measurement(data.fanspeed, 0, "%")})` : undefined}
          highlightValue={numeric(data?.fanrpm)}
        />
        <Block label="nerdaxe.sessionbest" value={data ? difficulty(data.bestSessionDiff) : undefined} />
        <Block
          label="nerdaxe.pool"
          value={
            data ? (
              <>
                <span className={styles.badge}>{pool.address === "N/A" ? "N/A" : t(`nerdaxe.${pool.mode}`)}</span>
                <span className={styles.secondary}>{pool.address}</span>
              </>
            ) : undefined
          }
        />
      </Container>
      {data?.updatedAt && (
        <p className={styles.updated}>
          {t("nerdaxe.updated")}{" "}
          <time dateTime={new Date(data.updatedAt).toISOString()}>{new Date(data.updatedAt).toLocaleTimeString()}</time>
        </p>
      )}
    </div>
  );
}
