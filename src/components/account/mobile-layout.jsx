import { useSession } from "next-auth/react";
import { useState } from "react";
import useSWR from "swr";

import usePreferences from "./preferences";

import styles from "components/settings/editor.module.css";

const move = (items, index, delta) => {
  const next = [...items];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
};
export default function MobileLayout() {
  const preferences = usePreferences();
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.id || session?.user?.email;
  const { data, error } = useSWR(
    preferences.data && status === "authenticated" && identity ? ["mobile-layout-catalog", identity] : null,
    async () => {
      const response = await fetch("/api/gather/mobile-layout", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      return result;
    },
  );
  return (
    <section className={styles.card}>
      <h2>Phone layout & pinned favorites</h2>
      <p>
        Customize the dashboard currently selected for your account. This profile applies below 640 pixels; your desktop
        arrangement stays independent.
      </p>
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <MobileEditor
          key={`${identity}:${data.target}`}
          target={data.target}
          catalog={data.catalog}
          saved={preferences.data?.mobileProfiles?.[data.target]}
          refresh={preferences.mutate}
        />
      )}
    </section>
  );
}
export function MobileEditor({ target, catalog, saved, refresh, request = fetch }) {
  const groups = catalog.map((g) => ({
    ...g,
    items: [...(saved?.groups?.find((s) => s.kind === g.kind && s.name === g.name)?.items || []), ...g.items].filter(
      (v, i, list) => list.indexOf(v) === i && g.items.includes(v),
    ),
  }));
  groups.sort((a, b) => {
    const rank = (g) => {
      const n = saved?.groups?.findIndex((s) => s.kind === g.kind && s.name === g.name);
      return n >= 0 ? n : 1000;
    };
    return rank(a) - rank(b);
  });
  const [profile, setProfile] = useState({
    enabled: saved?.enabled ?? false,
    density: saved?.density || "comfortable",
    groups,
    pins: saved?.pins || [],
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const response = await request("/api/gather/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
            body: JSON.stringify({ mobileProfile: { target, profile } }),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error);
          await refresh(result, false);
          setMessage("Phone layout saved.");
        } catch (error) {
          setMessage(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <label>
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(e) => setProfile({ ...profile, enabled: e.target.checked })}
          />{" "}
          Use a separate phone layout
        </label>
        <label>
          Phone density{" "}
          <select value={profile.density} onChange={(e) => setProfile({ ...profile, density: e.target.value })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        {profile.groups.map((group, index) => (
          <details key={`${group.kind}:${group.name}`}>
            <summary>
              {group.name} · {group.kind}
            </summary>
            <button
              type="button"
              disabled={!index}
              aria-label={`Move ${group.name} up`}
              onClick={() => setProfile({ ...profile, groups: move(profile.groups, index, -1) })}
            >
              Move group up
            </button>
            <button
              type="button"
              disabled={index === profile.groups.length - 1}
              aria-label={`Move ${group.name} down`}
              onClick={() => setProfile({ ...profile, groups: move(profile.groups, index, 1) })}
            >
              Move group down
            </button>
            {group.items.map((name, i) => {
              const pin = { kind: group.kind, group: group.name, name };
              const pinned = profile.pins.some(
                (p) => p.kind === pin.kind && p.group === pin.group && p.name === pin.name,
              );
              return (
                <div key={name} className="flex flex-wrap items-center gap-2 my-2">
                  <span>{name}</span>
                  <button
                    type="button"
                    disabled={!i}
                    aria-label={`Move ${name} up`}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        groups: profile.groups.map((g, j) => (j === index ? { ...g, items: move(g.items, i, -1) } : g)),
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === group.items.length - 1}
                    aria-label={`Move ${name} down`}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        groups: profile.groups.map((g, j) => (j === index ? { ...g, items: move(g.items, i, 1) } : g)),
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={!pinned && profile.pins.length >= 50}
                    aria-pressed={pinned}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        pins: pinned
                          ? profile.pins.filter(
                              (p) => !(p.kind === pin.kind && p.group === pin.group && p.name === pin.name),
                            )
                          : [...profile.pins, pin],
                      })
                    }
                  >
                    {pinned ? "Unpin" : "Pin favorite"}
                  </button>
                </div>
              );
            })}
          </details>
        ))}
        <button type="submit">Save phone layout</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
