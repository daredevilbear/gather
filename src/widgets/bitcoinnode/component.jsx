import { useTranslation } from "next-i18next/pages";

import { duration, size, syncPercent } from "./metrics";
import styles from "./styles.module.css";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

const networks = ["clearnet", "tor", "i2p", "other"];
const colors = ["#fb923c", "#c66b11", "#874713", "#87909e"];

function Connections({ data }) {
  const { t } = useTranslation();
  let end = 0;
  const segments = networks.map((network, i) => {
    const start = end;
    end += data.connections ? (data.peers[network] / data.connections) * 100 : 0;
    return `${colors[i]} ${start}% ${end}%`;
  });
  return (
    <section className={styles.connections} aria-label={t("bitcoinnode.connections")}>
      <div
        className={styles.ring}
        style={{ background: data.connections ? `conic-gradient(${segments.join(",")})` : "#68707b" }}
        aria-hidden="true"
      >
        <div>
          {data.connections}
          <small>{t("bitcoinnode.peers")}</small>
        </div>
      </div>
      <dl className={styles.legend}>
        {networks
          .filter((network) => network !== "other" || data.peers.other > 0)
          .map((network) => (
            <div key={network}>
              <dt>
                <i style={{ background: colors[networks.indexOf(network)] }} />
                {t(`bitcoinnode.${network}`)}
              </dt>
              <dd>{data.peers[network]}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

function RecentBlocks({ data }) {
  const { t } = useTranslation();
  return (
    <section className={styles.recent} aria-label={t("bitcoinnode.latestblocks")}>
      <h4>{t("bitcoinnode.latestblocks")}</h4>
      <ol className={styles.blocks}>
        {data.blocks.map((block) => (
          <li key={block.hash}>
            <strong>{block.height.toLocaleString()}</strong>
            <span>{size(block.size, "MB")}</span>
            <time
              dateTime={new Date(block.time * 1000).toISOString()}
              title={new Date(block.time * 1000).toLocaleString()}
            >
              {duration(Math.max(0, data.updatedAt / 1000 - block.time))} {t("bitcoinnode.ago")}
            </time>
          </li>
        ))}
      </ol>
      {data.blocksUnavailable && <p>{t("bitcoinnode.blocksunavailable")}</p>}
    </section>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { data, error } = useWidgetAPI(service.widget, "info", undefined, { refreshInterval: 30000 });
  if (error) return <Container service={service} error={error} />;
  const value = (v) => (data ? v : undefined);
  return (
    <div className={styles.card}>
      <Container service={service}>
        <Block label="bitcoinnode.connections" value={value(data?.connections)} />
        <Block label="bitcoinnode.mempool" value={value(size(data?.mempool, "MB"))} />
        <Block label="bitcoinnode.blockchainsize" value={value(size(data?.blockchainSize, "GB"))} />
        <Block label="bitcoinnode.uptime" value={value(duration(data?.uptime))} />
        <Block
          label="bitcoinnode.sync"
          value={
            data
              ? `${t(data.synced ? "bitcoinnode.synchronized" : "bitcoinnode.syncing")} ${syncPercent(data)}`
              : undefined
          }
        />
        <Block
          label="bitcoinnode.status"
          value={data ? t(data.networkActive ? "bitcoinnode.running" : "bitcoinnode.networkdisabled") : undefined}
        />
        <Block label="bitcoinnode.version" value={value(data?.version || "N/A")} />
        <Block label="bitcoinnode.height" value={value(data?.height?.toLocaleString() ?? "N/A")} />
        {data && <Connections field="bitcoinnode.networks" data={data} />}
        {data && <RecentBlocks field="bitcoinnode.latestblocks" data={data} />}
      </Container>
      {data && (
        <p className={styles.updated}>
          {data.chain} · {data.pruned ? `${t("bitcoinnode.pruned")} · ` : ""}
          {t("bitcoinnode.updated")}{" "}
          <time dateTime={new Date(data.updatedAt).toISOString()}>{new Date(data.updatedAt).toLocaleTimeString()}</time>
        </p>
      )}
    </div>
  );
}
