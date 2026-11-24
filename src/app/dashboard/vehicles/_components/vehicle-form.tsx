"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { ActionState } from "@/app/dashboard/_lib/action-state";
import { CustomerPicker } from "@/components/dashboard/customer-picker";
import { Field, fieldAria, selectClass } from "@/components/forms/field";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

import { createVehicleAction, updateVehicleAction } from "../actions";

export interface VehicleFormInitial {
  id?: string;
  updatedAt?: string;
  vin?: string | null;
  chassisNumber?: string | null;
  make?: string;
  model?: string | null;
  modelYear?: number | null;
  fuelType?: string | null;
  colour?: string | null;
  engineNumber?: string | null;
}

const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "OTHER"] as const;

export function VehicleForm({
  mode,
  initial = {},
  owner,
  canSetOwner,
}: {
  mode: "create" | "edit";
  initial?: VehicleFormInitial;
  owner?: { id: string; displayName: string } | null;
  canSetOwner?: boolean;
}) {
  const t = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(
    mode === "create" ? createVehicleAction : updateVehicleAction,
    {},
  );
  const v = (k: string, fallback?: string | number | null) =>
    state.values?.[k] ?? (fallback == null ? "" : String(fallback));
  const err = (k: string) => state.fieldErrors?.[k];
  const cancel = initial.id ? `/dashboard/vehicles/${initial.id}` : "/dashboard/vehicles";

  return (
    <form action={formAction} className="max-w-2xl space-y-6" noValidate>
      <FormStatus state={state} />
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}

      {mode === "create" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="plate"
            label={t("vehicles.fields.plate")}
            hint={t("vehicles.fields.plateHint")}
            errors={err("plate")}
            optional
          >
            <Input
              name="plate"
              defaultValue={v("plate")}
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              {...fieldAria("plate", err("plate"), true)}
            />
          </Field>
          {canSetOwner ? (
            <Field
              id="owner"
              label={t("vehicles.fields.owner")}
              hint={t("vehicles.fields.ownerHint")}
              errors={err("ownerCustomerId")}
              optional
            >
              <CustomerPicker
                id="owner"
                name="ownerCustomerId"
                initial={owner ?? null}
                invalid={!!err("ownerCustomerId")}
                describedBy="owner-hint"
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="vin"
          label={t("vehicles.fields.vin")}
          hint={t("vehicles.fields.vinHint")}
          errors={err("vin")}
          optional
        >
          <Input
            name="vin"
            defaultValue={v("vin", initial.vin)}
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono"
            {...fieldAria("vin", err("vin"), true)}
          />
        </Field>
        <Field
          id="chassisNumber"
          label={t("vehicles.fields.chassisNumber")}
          hint={t("vehicles.fields.chassisHint")}
          errors={err("chassisNumber")}
          optional
        >
          <Input
            name="chassisNumber"
            defaultValue={v("chassisNumber", initial.chassisNumber)}
            maxLength={30}
            autoComplete="off"
            {...fieldAria("chassisNumber", err("chassisNumber"), true)}
          />
        </Field>
        <Field id="make" label={t("vehicles.fields.make")} errors={err("make")}>
          <Input
            name="make"
            defaultValue={v("make", initial.make)}
            maxLength={60}
            required
            autoComplete="off"
            {...fieldAria("make", err("make"))}
          />
        </Field>
        <Field id="model" label={t("vehicles.fields.model")} errors={err("model")} optional>
          <Input
            name="model"
            defaultValue={v("model", initial.model)}
            maxLength={60}
            autoComplete="off"
            {...fieldAria("model", err("model"))}
          />
        </Field>
        <Field
          id="modelYear"
          label={t("vehicles.fields.modelYear")}
          errors={err("modelYear")}
          optional
        >
          <Input
            name="modelYear"
            inputMode="numeric"
            defaultValue={v("modelYear", initial.modelYear)}
            maxLength={4}
            autoComplete="off"
            {...fieldAria("modelYear", err("modelYear"))}
          />
        </Field>
        <Field id="fuelType" label={t("vehicles.fields.fuelType")} optional>
          <select
            id="fuelType"
            name="fuelType"
            className={selectClass}
            defaultValue={v("fuelType", initial.fuelType)}
          >
            <option value="">{t("common.none")}</option>
            {FUELS.map((f) => (
              <option key={f} value={f}>
                {t(`vehicles.fuel.${f}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="colour" label={t("vehicles.fields.colour")} errors={err("colour")} optional>
          <Input
            name="colour"
            defaultValue={v("colour", initial.colour)}
            maxLength={40}
            autoComplete="off"
            {...fieldAria("colour", err("colour"))}
          />
        </Field>
        <Field
          id="engineNumber"
          label={t("vehicles.fields.engineNumber")}
          errors={err("engineNumber")}
          optional
        >
          <Input
            name="engineNumber"
            defaultValue={v("engineNumber", initial.engineNumber)}
            maxLength={30}
            autoComplete="off"
            {...fieldAria("engineNumber", err("engineNumber"))}
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <SubmitButton>
          {mode === "create" ? t("common.save") : t("common.saveChanges")}
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href={cancel}>{t("common.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
