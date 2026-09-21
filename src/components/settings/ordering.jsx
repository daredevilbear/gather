import { useRef, useState } from "react";

import styles from "./editor.module.css";

export function moveTo(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Only drags started in this list are accepted; external text/files never reorder it.
export function useOrdering(onMove) {
  const dragged = useRef(null);
  const [over, setOver] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const finish = () => {
    dragged.current = null;
    setOver(null);
  };
  return {
    announcement,
    handle(scope, index, name, length) {
      return {
        name,
        onPointerDown(event) {
          if (event.button !== 0) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragged.current = { scope, index, name, x: event.clientX, y: event.clientY, target: null };
        },
        onPointerMove(event) {
          const source = dragged.current;
          if (!source || source.scope !== scope || source.index !== index || source.x === undefined) return;
          if (Math.hypot(event.clientX - source.x, event.clientY - source.y) < 5) return;
          let target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-order-scope]");
          while (target && target.dataset.orderScope !== scope)
            target = target.parentElement?.closest("[data-order-scope]");
          source.target = target ? Number(target.dataset.orderIndex) : null;
          setOver(target ? `${scope}:${source.target}` : null);
        },
        onPointerUp(event) {
          const source = dragged.current;
          if (source?.target != null && source.target !== index) {
            onMove(scope, index, source.target);
            setAnnouncement(`${name} reordered. Save to apply.`);
          }
          if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          finish();
        },
        onPointerCancel: finish,
        onKeyDown(event) {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const next = index + (event.key === "ArrowUp" ? -1 : 1);
          if (next < 0 || next >= length) return;
          onMove(scope, index, next);
          requestAnimationFrame(() => {
            const target = [...document.querySelectorAll("[data-order-scope]")].find(
              (element) => element.dataset.orderScope === scope && Number(element.dataset.orderIndex) === next,
            );
            target?.querySelector("button")?.focus();
          });
          setAnnouncement(`${name} moved ${event.key === "ArrowUp" ? "up" : "down"}. Save to apply.`);
        },
      };
    },
    target(scope, index) {
      return {
        "data-order-scope": scope,
        "data-order-index": index,
        "data-drop-target": over === `${scope}:${index}` || undefined,
      };
    },
  };
}

export function DragHandle({ name, ...events }) {
  return (
    <button
      type="button"
      className={styles.dragHandle}
      draggable={false}
      aria-label={`Reorder ${name}`}
      title="Drag to reorder. Keyboard: Alt + Up or Down."
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      {...events}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
        {[5, 10, 15].map((y) => (
          <g key={y}>
            <circle cx="5" cy={y} r="1.3" />
            <circle cx="11" cy={y} r="1.3" />
          </g>
        ))}
      </svg>
    </button>
  );
}
