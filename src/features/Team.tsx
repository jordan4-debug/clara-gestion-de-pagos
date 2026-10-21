import { useEffect, useState } from "react";
import { Users, Plus, ShieldCheck } from "lucide-react";
import { Field, FormError, Modal, Submit, formData } from "../components/ui";
import { api, send, dateTime } from "../lib/api";
import type { Member, User } from "../types";
type TeamData = {
  members: Member[];
  canManage: boolean;
  events: {
    id: number;
    action: string;
    actor: string;
    target: string;
    created_at: string;
  }[];
};
export function Team({
  user,
  notify,
  publicDemo,
}: {
  user: User;
  notify: (s: string) => void;
  publicDemo: boolean;
}) {
  const [team, setTeam] = useState<TeamData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false),
    [target, setTarget] = useState<Member | null>(null);
  const load = () => api<TeamData>("/team").then(setTeam);
  useEffect(() => {
    let active = true;
    void api<TeamData>("/team")
      .then((t) => {
        if (active) setTeam(t);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <div className="workflow-note">
        <ShieldCheck size={21} />
        <p>
          Cada integrante ingresa con su propia cuenta. El rol determina qué
          puede hacer y cada abono conserva quién lo registró.
        </p>
      </div>
      <FormError message={error} />
      {publicDemo && team?.canManage ? (
        <div className="notice">
          <strong>El acceso público de demostración sigue activo</strong>
          <p>
            Las cuentas privadas comparten este espacio con los accesos de
            demostración. Usa datos ficticios hasta desactivar la demostración y
            volver a publicar.
          </p>
        </div>
      ) : null}
      {team && !team.canManage ? (
        <div className="notice">
          <strong>Estás explorando cuentas de demostración</strong>
          <p>
            La gestión de integrantes está disponible al iniciar sesión con una
            cuenta privada de gerente. Las cuentas públicas no pueden consultar
            ni modificar usuarios privados.
          </p>
        </div>
      ) : null}
      <section className="panel workflow-panel">
        <div className="panel-title">
          <h2>
            <Users size={21} />
            Integrantes del espacio
          </h2>
          {team?.canManage ? (
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              Nuevo integrante
            </button>
          ) : null}
        </div>
        {!team && !error ? (
          <p role="status" className="muted">
            Cargando integrantes…
          </p>
        ) : null}
        <div className="team-list">
          {team?.members.map((m) => (
            <article key={m.id}>
              <span className="avatar">{m.name.slice(0, 2).toUpperCase()}</span>
              <div className="member-copy">
                <strong>
                  {m.name}
                  {m.id === user.id ? " (tú)" : ""}
                </strong>
                <p>{m.email}</p>
                <small>
                  {m.role === "owner"
                    ? "Gerente · supervisa y administra"
                    : "Asistente · registra y corrige"}
                </small>
              </div>
              <span
                className={`review-status ${m.active ? "verified" : "observed"}`}
              >
                {m.active ? "Activo" : "Inactivo"}
              </span>
              {team.canManage && m.id !== user.id ? (
                <button className="button" onClick={() => setTarget(m)}>
                  {m.active ? "Desactivar" : "Activar"}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      {team?.events.length ? (
        <section className="panel workflow-panel team-events">
          <div className="panel-title">
            <h2>Historial de accesos del equipo</h2>
          </div>
          <div className="compact-activity">
            {team.events.map((e) => (
              <article key={e.id}>
                <strong>
                  {e.action} · {e.target}
                </strong>
                <small>
                  {e.actor} · {dateTime(e.created_at)}
                </small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {create ? (
        <Modal
          title="Nuevo integrante"
          busy={busy}
          onClose={() => {
            if (!busy) setCreate(false);
          }}
        >
          <form
            className="form-body"
            onSubmit={async (e) => {
              const f = formData(e);
              setBusy(true);
              setError("");
              try {
                await send("/team", Object.fromEntries(f));
                await load();
                setCreate(false);
                notify(
                  "Integrante creado. Comparte su acceso por un medio privado.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nombre">
              <input
                name="name"
                minLength={2}
                maxLength={100}
                required
                autoFocus
              />
            </Field>
            <Field label="Correo electrónico">
              <input name="email" type="email" maxLength={150} required />
            </Field>
            <Field label="Rol">
              <select name="role">
                <option value="assistant">Asistente</option>
                <option value="owner">Gerente</option>
              </select>
            </Field>
            <Field
              label="Contraseña inicial"
              hint="Entre 12 y 128 caracteres. El integrante puede cambiarla desde su cuenta."
            >
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
            <FormError message={error} />
            <div className="form-actions">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setCreate(false)}
              >
                Cancelar
              </button>
              <Submit busy={busy}>Crear integrante</Submit>
            </div>
          </form>
        </Modal>
      ) : null}
      {target ? (
        <Modal
          title={target.active ? "Desactivar integrante" : "Activar integrante"}
          busy={busy}
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <div className="form-body">
            <p>
              {target.active
                ? `Se cerrarán las sesiones de ${target.name}. Sus abonos y su historial se conservarán.`
                : `${target.name} podrá iniciar sesión nuevamente.`}
            </p>
            <FormError message={error} />
            <div className="form-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setTarget(null)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await send(
                      `/team/${target.id}`,
                      { active: !target.active },
                      "PATCH",
                    );
                    await load();
                    setTarget(null);
                    notify("Estado del integrante actualizado.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
