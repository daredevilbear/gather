import { signOut, useSession } from "next-auth/react";
import { useTranslation } from "next-i18next/pages";

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

  const user = session.user;
  const name = user.name?.trim().split(/\s+/)[0] || user.email || "Account";
  const settings = accountSettingsUrl(settingsUrl);
  const image = accountSettingsUrl(user.image);

  return (
    <details className="w-full sm:w-auto rounded-xl border border-theme-500/30 bg-theme-100/10 dark:bg-theme-900/30 text-theme-800 dark:text-theme-200">
      <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 list-none">
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
          ⌄
        </span>
      </summary>
      <div className="flex flex-wrap gap-3 border-t border-theme-500/20 px-4 py-2">
        {settings && (
          <a href={settings} className="flex min-h-11 items-center underline">
            Account settings
          </a>
        )}
        <button type="button" className="min-h-11" onClick={() => signOut({ callbackUrl: "/auth/signin?autologin=0" })}>
          {t("auth.signout")}
        </button>
      </div>
    </details>
  );
}
