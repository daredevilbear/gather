import classNames from "classnames";
import Link from "next/link";
import { useContext } from "react";

import styles from "./header.module.css";
import GatherIcon from "./icon";
import GatherMark from "./mark";

import AccountMenu from "components/account/menu";
import usePreferences from "components/account/preferences";
import Inbox from "components/notifications/inbox";
import Tab, { slugifyAndEncode } from "components/tab";
import { TabContext } from "utils/contexts/tab";

export default function GatherHeader({ settings = {}, tabs = [], onSearch, informationWidgets }) {
  const { data: preferences } = usePreferences();
  const { activeTab, setActiveTab } = useContext(TabContext) || {};
  const selectedTab = tabs.find((tab) => slugifyAndEncode(tab) === activeTab) || tabs[0];
  const above = preferences?.widgetsPosition === "above";
  return (
    <header className={styles.header} aria-label="Gather application">
      <Link href="/" className={styles.brand} aria-label="Gather home">
        <GatherMark className={styles.mark} />
        <span>
          Gather<small>Your everyday, together.</small>
        </span>
      </Link>
      <div className={styles.searchArea}>
        <button className={styles.search} type="button" onClick={onSearch}>
          <GatherIcon name="search" />
          <span>Find services & bookmarks</span>
        </button>
      </div>
      <nav className={styles.actions} aria-label="Application">
        {settings.gather?.accountMenu !== false && (
          <AccountMenu
            settingsUrl={settings.gather?.accountSettingsUrl}
            notifications={
              settings.gather?.notifications ? <Inbox prefix={settings.gather.notificationPrefix} menuItem /> : null
            }
          />
        )}
      </nav>
      {above && informationWidgets && <div className={styles.information}>{informationWidgets}</div>}
      {tabs.length > 0 && (
        <nav id="tabs" className={styles.tabs} aria-label="Dashboard sections">
          <select
            className={styles.sectionSelect}
            aria-label="Dashboard section"
            value={selectedTab ? slugifyAndEncode(selectedTab) : ""}
            onChange={(event) => {
              setActiveTab(event.target.value);
              window.location.hash = `#${event.target.value}`;
            }}
          >
            {tabs.map((tab) => (
              <option key={tab} value={slugifyAndEncode(tab)}>
                {tab}
              </option>
            ))}
          </select>
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
