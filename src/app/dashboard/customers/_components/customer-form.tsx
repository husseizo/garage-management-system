"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { ActionState } from "@/app/dashboard/_lib/action-state";
import { Field, fieldAria, selectClass, textareaClass } from "@/components/forms/field";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

import { createCustomerAction, updateCustomerAction } from "../actions";

export interface CustomerFormInitial {
  id?: string;
  updatedAt?: string;
  kind?: "INDIVIDUAL" | "COMPANY";
  givenName?: string | null;
  familyName?: string | null;
  companyName?: string | null;
  taxId?: string | null;
  preferredLanguage?: string;
  notes?: string | null;
}

const REASON_KEYS = {
  phone: "customers.duplicates.reasonPhone",
  email: "customers.duplicates.reasonEmail",
  name: "customers.duplicates.reasonName",
  taxId: "customers.duplicates.reasonTaxId",
} as const;

export function CustomerForm({
  mode,
  initial = {},
}: {
  mode: "create" | "edit";
  initial?: CustomerFormInitial;
}) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(
    mode === "create" ? createCustomerAction : updateCustomerAction,
    {},
  );
  const v = (k: string, fallback?: string | null) => state.values?.[k] ?? fallback ?? "";
  const [kind, setKind] = useState<"INDIVIDUAL" | "COMPANY">(
    (state.values?.kind as "INDIVIDUAL" | "COMPANY" | undefined) ?? initial.kind ?? "INDIVIDUAL",
  );
  const err = (k: string) => state.fieldErrors?.[k];
  const cancelHref = initial.id ? `/dashboard/customers/${initial.id}` : "/dashboard/customers";

  return (
    <form action={formAction} className="max-w-2xl space-y-6" noValidate>
      <FormStatus state={state.duplicates ? {} : state} />
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}

      {/* The submitted kind comes from state, so React's post-action form reset cannot flip it. */}
      <input type="hidden" name="kind" value={kind} />
      <fieldset className="space-y-2" disabled={mode === "edit"}>
        <legend className="text-sm font-medium">{t("customers.fields.kind")}</legend>
        <div className="flex gap-4">
          {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="kindChoice"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {t(`customers.kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "INDIVIDUAL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="givenName" label={t("customers.fields.givenName")} errors={err("givenName")}>
            <Input
              name="givenName"
              defaultValue={v("givenName", initial.givenName)}
              maxLength={100}
              autoComplete="off"
              {...fieldAria("givenName", err("givenName"))}
            />
          </Field>
          <Field
            id="familyName"
            label={t("customers.fields.familyName")}
            errors={err("familyName")}
          >
            <Input
              name="familyName"
              defaultValue={v("familyName", initial.familyName)}
              maxLength={100}
              autoComplete="off"
              {...fieldAria("familyName", err("familyName"))}
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="companyName"
            label={t("customers.fields.companyName")}
            errors={err("companyName")}
          >
            <Input
              name="companyName"
              defaultValue={v("companyName", initial.companyName)}
              maxLength={200}
              autoComplete="off"
              {...fieldAria("companyName", err("companyName"))}
            />
          </Field>
          <Field
            id="taxId"
            label={t("customers.fields.taxId")}
            hint={t("customers.fields.taxIdHint")}
            errors={err("taxId")}
            optional
          >
            <Input
              name="taxId"
              inputMode="numeric"
              defaultValue={v("taxId", initial.taxId)}
              maxLength={24}
              autoComplete="off"
              {...fieldAria("taxId", err("taxId"), true)}
            />
          </Field>
        </div>
      )}

      {mode === "create" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="phone"
            label={t("customers.fields.phone")}
            hint={t("customers.fields.phoneHint")}
            errors={err("phone")}
            optional
          >
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={v("phone")}
              maxLength={32}
              autoComplete="off"
              {...fieldAria("phone", err("phone"), true)}
            />
          </Field>
          <Field id="email" label={t("customers.fields.email")} errors={err("email")} optional>
            <Input
              name="email"
              type="email"
              defaultValue={v("email")}
              maxLength={254}
              autoComplete="off"
              {...fieldAria("email", err("email"))}
            />
          </Field>
          {kind === "COMPANY" ? (
            <Field
              id="contactPerson"
              label={t("customers.fields.contactPerson")}
              errors={err("contactPerson")}
              optional
            >
              <Input
                name="contactPerson"
                defaultValue={v("contactPerson")}
                maxLength={100}
                autoComplete="off"
                {...fieldAria("contactPerson", err("contactPerson"))}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="preferredLanguage" label={t("customers.fields.preferredLanguage")}>
          <select
            name="preferredLanguage"
            className={selectClass}
            defaultValue={v("preferredLanguage", initial.preferredLanguage ?? "sw")}
            id="preferredLanguage"
          >
            <option value="sw">{t("locale.sw")}</option>
            <option value="en">{t("locale.en")}</option>
          </select>
        </Field>
      </div>

      <Field
        id="notes"
        label={t("customers.fields.notes")}
        hint={t("customers.fields.notesHint")}
        errors={err("notes")}
        optional
      >
        <textarea
          name="notes"
          className={textareaClass}
          defaultValue={v("notes", initial.notes)}
          maxLength={2000}
          {...fieldAria("notes", err("notes"), true)}
        />
      </Field>

      {state.duplicates?.length ? (
        <Alert
          role="alert"
          className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
        >
          <AlertTitle>{t("customers.duplicates.title")}</AlertTitle>
          <AlertDescription className="space-y-3 text-inherit">
            <p>{t("customers.duplicates.body")}</p>
            <ul className="list-disc space-y-1 pl-5">
              {state.duplicates.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dashboard/customers/${d.id}`}
                    className="font-medium underline"
                    target="_blank"
                  >
                    {d.displayName}
                  </Link>{" "}
                  ({t(`customers.kind.${d.kind}`)}) —{" "}
                  {d.reasons
                    .map((r) => t(REASON_KEYS[r as keyof typeof REASON_KEYS] ?? "common.none"))
                    .join(", ")}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" name="confirmDuplicates" value="on" required />
              {t("customers.duplicates.confirm")}
            </label>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton>
          {mode === "create" ? t("common.save") : t("common.saveChanges")}
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>{t("common.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
