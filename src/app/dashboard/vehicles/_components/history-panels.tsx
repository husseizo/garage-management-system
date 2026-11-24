"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { ActionState } from "@/app/dashboard/_lib/action-state";
import { ActionButton } from "@/components/dashboard/action-button";
import { CustomerPicker } from "@/components/dashboard/customer-picker";
import { Field, fieldAria, selectClass } from "@/components/forms/field";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { formatDate } from "@/i18n/format";

import {
  assignKeeperAction,
  changeRegistrationAction,
  endKeeperAction,
  transferOwnershipAction,
} from "../actions";

export interface RegistrationView {
  id: string;
  plate: string;
  validFrom: string;
  validTo: string | null;
}
export interface OwnershipView {
  id: string;
  role: "OWNER" | "KEEPER";
  customerId: string;
  customerName: string;
  startedAt: string;
  endedAt: string | null;
  source: string;
}

function useDate(timeZone: string) {
  const locale = useLocale();
  return (d: string | null) => (d ? formatDate(d, INTL_LOCALE[locale], timeZone) : "");
}

export function RegistrationPanel({
  vehicleId,
  registrations,
  canChange,
  timeZone,
}: {
  vehicleId: string;
  registrations: RegistrationView[];
  canChange: boolean;
  timeZone: string;
}) {
  const t = useT();
  const fmt = useDate(timeZone);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(changeRegistrationAction, {});
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("vehicles.registration.title")}</CardTitle>
        {canChange ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {t("vehicles.registration.change")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {state.ok ? <FormStatus state={state} successKey="vehicles.registration.changed" /> : null}
        {open && canChange ? (
          <form action={formAction} className="space-y-3 rounded-md border p-3" noValidate>
            {state.ok === false ? <FormStatus state={state} /> : null}
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="new-plate"
                label={t("vehicles.fields.plate")}
                hint={t("vehicles.fields.plateHint")}
                errors={err("plate")}
              >
                <Input
                  name="plate"
                  maxLength={20}
                  autoCapitalize="characters"
                  defaultValue={state.ok ? "" : state.values?.plate}
                  {...fieldAria("new-plate", err("plate"), true)}
                />
              </Field>
              <Field
                id="plate-effective"
                label={t("vehicles.fields.effectiveAt")}
                errors={err("effectiveAt")}
                optional
              >
                <Input
                  name="effectiveAt"
                  type="date"
                  {...fieldAria("plate-effective", err("effectiveAt"))}
                />
              </Field>
            </div>
            <SubmitButton size="sm">{t("common.save")}</SubmitButton>
          </form>
        ) : null}
        {registrations.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("vehicles.registration.empty")}</p>
        ) : (
          <ul className="divide-y">
            {registrations.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-mono font-medium">
                  {r.plate}{" "}
                  {!r.validTo ? (
                    <Badge variant="secondary">{t("vehicles.registration.current")}</Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {fmt(r.validFrom)} –{" "}
                  {r.validTo ? fmt(r.validTo) : t("vehicles.ownership.present")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function OwnershipPanel({
  vehicleId,
  ownerships,
  canTransfer,
  timeZone,
}: {
  vehicleId: string;
  ownerships: OwnershipView[];
  canTransfer: boolean;
  timeZone: string;
}) {
  const t = useT();
  const fmt = useDate(timeZone);
  const [mode, setMode] = useState<null | "owner" | "keeper">(null);
  const [transferState, transferAction] = useActionState<ActionState, FormData>(
    transferOwnershipAction,
    {},
  );
  const [keeperState, keeperAction] = useActionState<ActionState, FormData>(assignKeeperAction, {});
  const currentOwner = ownerships.find((o) => o.role === "OWNER" && !o.endedAt) ?? null;
  const state = mode === "keeper" ? keeperState : transferState;
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("vehicles.ownership.title")}</CardTitle>
        {canTransfer ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode(mode === "owner" ? null : "owner")}
              aria-expanded={mode === "owner"}
            >
              {currentOwner ? t("vehicles.ownership.transfer") : t("vehicles.ownership.setOwner")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === "keeper" ? null : "keeper")}
              aria-expanded={mode === "keeper"}
            >
              {t("vehicles.ownership.assignKeeper")}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {transferState.ok ? (
          <FormStatus state={transferState} successKey="vehicles.ownership.transferred" />
        ) : null}
        {keeperState.ok ? (
          <FormStatus state={keeperState} successKey="vehicles.ownership.keeperAssigned" />
        ) : null}

        {mode && canTransfer ? (
          <form
            action={mode === "owner" ? transferAction : keeperAction}
            className="space-y-3 rounded-md border p-3"
            noValidate
            key={mode}
          >
            {state.ok === false ? <FormStatus state={state} /> : null}
            <input type="hidden" name="vehicleId" value={vehicleId} />
            {mode === "owner" ? (
              <input type="hidden" name="expectedOwnershipId" value={currentOwner?.id ?? ""} />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="ownership-customer"
                label={
                  mode === "owner"
                    ? t("vehicles.ownership.newOwner")
                    : t("vehicles.ownership.keeper")
                }
                errors={err(mode === "owner" ? "toCustomerId" : "customerId")}
              >
                <CustomerPicker
                  id="ownership-customer"
                  name={mode === "owner" ? "toCustomerId" : "customerId"}
                />
              </Field>
              <Field
                id="ownership-effective"
                label={t("vehicles.fields.effectiveAt")}
                errors={err("effectiveAt")}
                optional
              >
                <Input
                  name="effectiveAt"
                  type="date"
                  {...fieldAria("ownership-effective", err("effectiveAt"))}
                />
              </Field>
              {mode === "owner" && currentOwner ? (
                <Field id="ownership-reason" label={t("vehicles.fields.reason")}>
                  <select
                    id="ownership-reason"
                    name="reason"
                    className={selectClass}
                    defaultValue="TRANSFER"
                  >
                    <option value="TRANSFER">{t("vehicles.ownership.reasons.TRANSFER")}</option>
                    <option value="CORRECTION">{t("vehicles.ownership.reasons.CORRECTION")}</option>
                  </select>
                </Field>
              ) : null}
            </div>
            <SubmitButton size="sm">{t("common.confirm")}</SubmitButton>
          </form>
        ) : null}

        {ownerships.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("vehicles.ownership.empty")}</p>
        ) : (
          <ul className="divide-y">
            {ownerships.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <Link
                    href={`/dashboard/customers/${o.customerId}`}
                    className="font-medium hover:underline"
                  >
                    {o.customerName}
                  </Link>{" "}
                  <Badge variant={o.endedAt ? "outline" : "secondary"}>
                    {t(`vehicles.ownership.role.${o.role}`)}
                  </Badge>
                </span>
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  {fmt(o.startedAt)} –{" "}
                  {o.endedAt ? fmt(o.endedAt) : t("vehicles.ownership.present")}
                  {o.role === "KEEPER" && !o.endedAt && canTransfer ? (
                    <ActionButton
                      action={endKeeperAction}
                      fields={{ vehicleId, ownershipId: o.id }}
                      label={t("vehicles.ownership.endKeeper")}
                      variant="ghost"
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
