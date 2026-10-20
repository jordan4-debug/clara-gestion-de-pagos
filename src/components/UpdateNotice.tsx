import { useEffect, useState } from "react";

export function UpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const current = import.meta.env.VITE_APP_BUILD;
    if (!current) return;
    let active = true;
    const controller = new AbortController();
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/version.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (
          active &&
          typeof data.version === "string" &&
          data.version !== current
        )
          setAvailable(true);
      } catch {
        /* A failed version check does not interrupt the current work. */
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return available ? (
    <div className="update-notice" role="status">
      <span>
        Hay una nueva versión de Clara. Guarda tu formulario y actualiza para
        ver los cambios.
      </span>
      <button
        className="button primary"
        onClick={() => window.location.reload()}
      >
        Actualizar
      </button>
    </div>
  ) : null;
}
