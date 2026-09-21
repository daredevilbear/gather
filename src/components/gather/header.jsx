import classNames from "classnames";
import Link from "next/link";

import styles from "./header.module.css";
import GatherIcon from "./icon";
import GatherMark from "./mark";

import usePreferences from "components/account/preferences";
import AccountMenu from "components/account/menu";
import Inbox from "components/notifications/inbox";
import Tab from "components/tab";

export default function GatherHeader({ settings = {}, tabs = [], onSearch, informationWidgets }) {
  const { data: preferences } = usePreferences();
  const above = preferences?.widgetsPosition === "above";
  return (
    <header className={styles.header} aria-label="Gather application">
      <Link href="/" className={styles.brand} aria-label="Gather home">
        <GatherMark className={styles.mark} />
        <span>
          Gather<small>Your everyday, together.</small>
        </span>
      </Link>
      <nav className={styles.actions} aria-label="Application">
        <button className={styles.search} type="button" onClick={onSearch}>
          <GatherIcon name="search" />
          <span>Find services & bookmarks</span>
        </button>
        {settings.gather?.notifications && <Inbox prefix={settings.gather.notificationPrefix} />}
        {settings.gather?.accountMenu !== false && <AccountMenu settingsUrl={settings.gather?.accountSettingsUrl} />}
      </nav>
      {above && informationWidgets && <div className={styles.information}>{informationWidgets}</div>}
      {tabs.length > 0 && (
        <nav id="tabs" className={styles.tabs} aria-label="Dashboard sections">
          <ul
            id="myTab"
            role="tablist"
            aria-label="Dashboard sections"
            className={classNames(
              styles.tabList,
              settings.cardBlur !== undefined &&
                `backdrop-blur${settings.cardBlur.length ? "-" : ""}${settings.cardBlur}`,
            )}
          >
            {tabs.map((tab) => (
              <Tab key={tab} tab={tab} />
            ))}
          </ul>
        </nav>
      )}
      {!above && informationWidgets && <div className={styles.information}>{informationWidgets}</div>}
    </header>
  );
}
