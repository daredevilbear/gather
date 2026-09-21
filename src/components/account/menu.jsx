import { signOut, useSession } from "next-auth/react";
import { useTranslation } from "next-i18next/pages";
import { useEffect, useRef } from "react";

import styles from "./menu.module.css";

import GatherIcon from "components/gather/icon";
import SettingsLink from "components/settings/link";

export function accountSettingsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export default function AccountMenu({ settingsUrl }) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  if (status !== "authenticated" || !session?.user) return null;
  return (
    <AccountMenuView
      user={session.user}
      settingsUrl={settingsUrl}
      dashboardSettings={<SettingsLink />}
      signOutLabel={t("auth.signout")}
      onSignOut={() => signOut({ callbackUrl: "/auth/signin?autologin=0" })}
    />
  );
}

export function AccountMenuView({ user, settingsUrl, dashboardSettings, signOutLabel = "Sign out", onSignOut }) {
  const box = useRef(null);
  useEffect(() => {
    function close(event) {
      if (
        box.current &&
        (event.key === "Escape" || (event.type === "pointerdown" && !box.current.contains(event.target)))
      ) {
        if (event.key === "Escape" && box.current.open) box.current.querySelector("summary")?.focus();
        box.current.open = false;
      }
    }
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  const name = user.name?.trim().split(/\s+/)[0] || user.email || "Account";
  const settings = accountSettingsUrl(settingsUrl);
  const image = accountSettingsUrl(user.image);

  return (
    <details ref={box} className={styles.account}>
      <summary className={styles.summary}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-theme-500/20">
            {Array.from(name)[0].toUpperCase()}
          </span>
        )}
        <span>{name}</span>
        <span aria-hidden="true" className="ml-auto">
          <GatherIcon name="chevron" />
        </span>
      </summary>
      <div className={styles.panel}>
        <strong>{user.name || name}</strong>
        {user.email && <small>{user.email}</small>}
        {dashboardSettings}
        {settings && (
          <a href={settings} className="flex min-h-11 items-center underline">
            Account settings
          </a>
        )}
        <button type="button" className="min-h-11" onClick={onSignOut}>
          {signOutLabel}
        </button>
      </div>
    </details>
  );
}
