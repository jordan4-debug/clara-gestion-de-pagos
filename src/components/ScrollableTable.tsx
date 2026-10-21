import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ScrollableTable({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const body = useRef<HTMLDivElement>(null),
    top = useRef<HTMLDivElement>(null);
  const id = useId();
  const [size, setSize] = useState({
    width: 0,
    viewport: 0,
    topViewport: 0,
    left: 0,
  });
  const measure = useCallback(() => {
    const element = body.current;
    if (element) {
      const next = {
        width: element.scrollWidth,
        viewport: element.clientWidth,
        topViewport: top.current?.clientWidth || 0,
        left: element.scrollLeft,
      };
      setSize((previous) =>
        previous.width === next.width &&
        previous.viewport === next.viewport &&
        previous.topViewport === next.topViewport &&
        previous.left === next.left
          ? previous
          : next,
      );
    }
  }, []);
  const overflow = size.width > size.viewport + 1;
  useEffect(measure, [overflow, measure]);
  useEffect(() => {
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (body.current) {
      observer?.observe(body.current);
      if (body.current.firstElementChild)
        observer?.observe(body.current.firstElementChild);
    }
    const timer = window.setTimeout(measure, 0); // The containing dialog opens after its children mount.
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [children, measure]);
  const sync = (from: "top" | "body") => {
    const source = from === "top" ? top.current : body.current;
    const destination = from === "top" ? body.current : top.current;
    if (source && destination && source.scrollLeft !== destination.scrollLeft)
      destination.scrollLeft = source.scrollLeft;
    measure();
  };
  const move = (direction: number) => {
    if (!body.current) return;
    body.current.scrollLeft = Math.max(
      0,
      Math.min(
        size.width - size.viewport,
        body.current.scrollLeft +
          direction * Math.max(180, size.viewport * 0.7),
      ),
    );
    sync("body");
  };
  return (
    <div className="scrollable-table">
      <div
        className="table-scroll-controls"
        role="group"
        hidden={size.viewport > 0 && !overflow}
        aria-label={`Mover ${label.toLowerCase()}`}
      >
        <button
          type="button"
          className="icon-button"
          aria-label="Mover tabla a la izquierda"
          aria-controls={id}
          disabled={size.left <= 0}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={19} />
        </button>
        <div
          ref={top}
          className="table-scroll-top"
          role="region"
          aria-label="Desplazamiento horizontal superior"
          tabIndex={0}
          onScroll={() => sync("top")}
        >
          <div
            style={{
              width:
                size.topViewport + Math.max(0, size.width - size.viewport) ||
                "100%",
            }}
          />
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Mover tabla a la derecha"
          aria-controls={id}
          disabled={size.left >= size.width - size.viewport - 1}
          onClick={() => move(1)}
        >
          <ChevronRight size={19} />
        </button>
      </div>
      <div
        ref={body}
        id={id}
        className="table-scroll scrollable-table-body"
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={() => sync("body")}
      >
        {children}
      </div>
    </div>
  );
}
