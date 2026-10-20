"use client";
import { useIdentityIntegrations, useOfferingCommands } from "./context";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@tudomacae/react-primitives/button";
import { offeringPriceLabel } from "../../offeringPresentation";
import type { OfferingCatalogState, OfferingFieldErrors } from "../../offeringCatalog";
import { ItemFields } from "./OfferingItemFields";
function savedMessage(form: FormData, enabled: boolean) {
  const operation = form.get("operation");
  if (operation === "enablement")
    return enabled ? "Exibição do catálogo habilitada." : "Exibição do catálogo revogada. Cadastro preservado.";
  if (operation === "visibility")
    return form.get("visible") === "true" ? "Item marcado para exibição." : "Item ocultado. Cadastro preservado.";
  return "Item salvo.";
}
export function OfferingCatalogManager({ businessId, initial, admin }: {
  businessId: string;
  initial: OfferingCatalogState;
  admin: boolean;
}) {
  const { capture } = useIdentityIntegrations();
  const { changeOfferingCatalog } = useOfferingCommands();
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ itemId: string; fields: OfferingFieldErrors } | null>(null);
  const [pending, startTransition] = useTransition();
  const tracked = useRef(false);
  const status = useRef<HTMLParagraphElement>(null);
  const focusAfterCreate = useRef(false);
  useLayoutEffect(() => {
    if (focusAfterCreate.current && !pending) {
      focusAfterCreate.current = false;
      status.current?.focus();
    }
  }, [state, pending]);
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      capture("business_offering_management_entered", { source: admin ? "administration" : "account" });
    }
  }, [admin, capture]);
  function submit(form: FormData) {
    setMessage("Salvando alterações…");
    setFieldErrors(null);
    startTransition(async () => {
      const result = await changeOfferingCatalog(businessId, state.revision, form);
      if ("state" in result) {
        if (state.items.length === 0 && result.state.items.length > 0)
          capture("business_offering_first_item_saved", { source: admin ? "administration" : "account" });
        focusAfterCreate.current = form.get("operation") === "save" && !form.get("itemId");
        setState(result.state);
        setMessage(savedMessage(form, result.state.enabled));
      }
      else {
        setMessage(result.error ?? "Não foi possível salvar.");
        if ("fieldErrors" in result) setFieldErrors({ itemId: String(form.get("itemId") ?? "new"), fields: result.fieldErrors });
      }
    });
  }
  return (
    <section
      className={
        // PostHog's privacy marker is a provider contract, not a Tailwind utility.

        "ph-no-capture mx-auto max-w-5xl space-y-8"
      }
      data-private-offering-catalog="true"
      aria-labelledby="catalog-management-title"
    >
      <header className="space-y-3">
        <h1
          id="catalog-management-title"
          className="text-3xl font-bold tracking-tight"
        >
          Catálogo do negócio
        </h1>
        <p className="max-w-2xl text-base/relaxed">Gravar preserva o cadastro. Exibir um item só o torna público quando o catálogo está habilitado e o Negócio está liberado no lançamento. Itens novos começam ocultos.</p>
      </header>
      <div className="
        flex flex-col gap-4 rounded-xl bg-secondary p-5
        sm:flex-row sm:items-center sm:justify-between
      "
      >
        <p className="max-w-xl font-medium">{state.enabled ? "Catálogo habilitado pelo administrador." : "Catálogo não habilitado pelo administrador. Você pode preparar e editar seus itens."}</p>
        {admin && (
          <form action={submit} className="shrink-0">
            <input type="hidden" name="operation" value="enablement" />
            <input type="hidden" name="enabled" value={String(!state.enabled)} />
            <Button
              className="
                min-h-11 w-full whitespace-normal
                focus-visible:ring-primary
                sm:w-auto
              "
              disabled={pending}
              variant="outline"
            >
              {state.enabled ? "Revogar exibição do catálogo" : "Habilitar exibição do catálogo"}
            </Button>
          </form>
        )}
      </div>
      <p
        ref={status}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="
          empty:hidden
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary
        "
      >
        {message}
      </p>
      <fieldset
        disabled={pending}
        className="
          grid min-w-0 gap-10
          lg:grid-cols-2
        "
      >
        <legend className="sr-only">Itens do catálogo</legend>
        <div className="min-w-0">
          <h2 className="mb-4 text-xl font-semibold">Itens do catálogo</h2>
          {state.items.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-sm/relaxed">
              Nenhum item cadastrado.
            </p>
          )}
          {state.items.map(item => (
            <article key={item.id} className="min-w-0 border-t py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-lg font-semibold wrap-anywhere">{item.name}</h3>
                  <p className="text-sm font-medium tabular-nums">{offeringPriceLabel(item.price)}</p>
                  <p className="text-sm">{item.visible ? "Marcado para exibição" : "Item oculto"}</p>
                </div>
                <form action={submit}>
                  <input type="hidden" name="operation" value="visibility" />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="visible" value={String(!item.visible)} />
                  <Button
                    className="
                      min-h-11
                      focus-visible:ring-primary
                    "
                    variant="outline"
                  >
                    {item.visible ? "Ocultar item" : "Exibir item"}
                  </Button>
                </form>
              </div>
              <details className="group mt-3">
                <summary className="
                  flex min-h-11 cursor-pointer items-center gap-2 rounded-md
                  text-sm font-medium text-primary underline-offset-4
                  hover:underline
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-primary
                "
                >
                  <ChevronRight
                    aria-hidden="true"
                    className="
                      size-4 transition-transform
                      group-open:rotate-90
                      motion-reduce:transition-none
                    "
                  />
                  Editar item
                  <span className="sr-only">
                    :
                    {item.name}
                  </span>
                </summary>
                <form action={submit} className="mt-4 grid gap-3">
                  <ItemFields item={item} admin={admin} errors={fieldErrors?.itemId === item.id ? fieldErrors.fields : {}} />
                  <Button
                    type="submit"
                    className="
                      mt-2 min-h-11
                      focus-visible:ring-primary
                    "
                  >
                    Salvar item
                  </Button>
                </form>
              </details>
            </article>
          ))}
        </div>
        {state.items.length < 100 && (
          <form
            key={state.items.length}
            action={submit}
            className="
              grid min-w-0 content-start gap-3 border-t pt-6
              lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8
            "
          >
            <h2 className="mb-2 text-xl font-semibold">Novo item</h2>
            <ItemFields admin={admin} errors={fieldErrors?.itemId === "new" ? fieldErrors.fields : {}} />
            <Button
              type="submit"
              className="
                mt-3 min-h-11
                focus-visible:ring-primary
              "
            >
              Cadastrar item oculto
            </Button>
          </form>
        )}
      </fieldset>
    </section>
  );
}
