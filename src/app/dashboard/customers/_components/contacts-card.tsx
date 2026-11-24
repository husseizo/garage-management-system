"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "@/app/dashboard/_lib/action-state";
import { ActionButton } from "@/components/dashboard/action-button";
import { Field, fieldAria, selectClass } from "@/components/forms/field";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/i18n/format";
import { useT } from "@/i18n/client";

import { addContactAction, removeContactAction, setPrimaryContactAction } from "../actions";

export interface ContactView {
  id: string;
  kind: "PHONE" | "EMAIL";
  value: string;
  label: string | null;
  contactPersonName: string | null;
  isPrimary: boolean;
  sharedWith: number;
}

export function ContactsCard({
  customerId,
  contacts,
  canManage,
  isCompany,
  archived,
}: {
  customerId: string;
  contacts: ContactView[] | null;
  canManage: boolean;
  isCompany: boolean;
  archived: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(addContactAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const shared = state.warnings?.find((w) => w.startsWith("shared:"));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("customers.contacts.title")}</CardTitle>
        {canManage && !archived && contacts ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
          >
            {t("customers.contacts.add")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {contacts === null ? (
          <p className="text-muted-foreground text-sm">{t("customers.contacts.hidden")}</p>
        ) : contacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("customers.contacts.empty")}</p>
        ) : (
          <ul className="divide-y">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {c.kind === "PHONE" ? (
                      <a href={`tel:${c.value}`} className="hover:underline">
                        {formatPhone(c.value)}
                      </a>
                    ) : (
                      <a href={`mailto:${c.value}`} className="hover:underline">
                        {c.value}
                      </a>
                    )}{" "}
                    {c.isPrimary ? (
                      <Badge variant="secondary">{t("customers.contacts.primary")}</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(`customers.contacts.kind.${c.kind}`)}
                    {c.label ? ` · ${c.label}` : ""}
                    {c.contactPersonName ? ` · ${c.contactPersonName}` : ""}
                  </p>
                  {c.sharedWith > 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("customers.contacts.sharedWarning", { count: c.sharedWith })}
                    </p>
                  ) : null}
                </div>
                {canManage && !archived ? (
                  <div className="flex gap-2">
                    {!c.isPrimary ? (
                      <ActionButton
                        action={setPrimaryContactAction}
                        fields={{ customerId, contactId: c.id }}
                        label={t("customers.contacts.makePrimary")}
                        variant="ghost"
                      />
                    ) : null}
                    <ActionButton
                      action={removeContactAction}
                      fields={{ customerId, contactId: c.id }}
                      label={t("common.remove")}
                      variant="ghost"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {state.ok && shared ? (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
            {t("customers.contacts.sharedWarning", { count: shared.slice(7) })}
          </p>
        ) : null}

        {adding && canManage && !archived ? (
          <form action={formAction} className="space-y-3 rounded-md border p-3" noValidate>
            <FormStatus
              state={{ ...state, warnings: undefined }}
              successKey="customers.contacts.added"
            />
            <input type="hidden" name="customerId" value={customerId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="contact-kind"
                label={
                  t("customers.contacts.kind.PHONE") + " / " + t("customers.contacts.kind.EMAIL")
                }
              >
                <select
                  id="contact-kind"
                  name="kind"
                  className={selectClass}
                  defaultValue={state.values?.kind ?? "PHONE"}
                >
                  <option value="PHONE">{t("customers.contacts.kind.PHONE")}</option>
                  <option value="EMAIL">{t("customers.contacts.kind.EMAIL")}</option>
                </select>
              </Field>
              <Field
                id="contact-value"
                label={t("customers.contacts.value")}
                hint={t("customers.fields.phoneHint")}
                errors={err("value")}
              >
                <Input
                  name="value"
                  defaultValue={state.ok ? "" : state.values?.value}
                  maxLength={254}
                  autoComplete="off"
                  {...fieldAria("contact-value", err("value"), true)}
                />
              </Field>
              <Field
                id="contact-label"
                label={t("customers.contacts.label")}
                optional
                errors={err("label")}
              >
                <Input
                  name="label"
                  placeholder={t("customers.contacts.labelPlaceholder")}
                  maxLength={50}
                  {...fieldAria("contact-label", err("label"))}
                />
              </Field>
              {isCompany ? (
                <Field
                  id="contact-person"
                  label={t("customers.fields.contactPerson")}
                  optional
                  errors={err("contactPersonName")}
                >
                  <Input
                    name="contactPersonName"
                    maxLength={100}
                    {...fieldAria("contact-person", err("contactPersonName"))}
                  />
                </Field>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimary" value="on" />{" "}
              {t("customers.contacts.makePrimary")}
            </label>
            <SubmitButton size="sm">{t("customers.contacts.add")}</SubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
