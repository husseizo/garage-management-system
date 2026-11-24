import { z } from "zod";

import { cleanText } from "../customers/normalize";
import { checkbox } from "../customers/schemas";

/** Vehicle input schemas. Error messages are i18n keys (`validation.*`). */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v))
    .pipe(z.string().max(max, "validation.tooLong").optional());

const uuid = z.uuid({ error: "validation.customerRequired" });

export const vehicleInputSchema = z.object({
  vin: optionalText(40),
  chassisNumber: optionalText(30),
  make: z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v) ?? "")
    .pipe(z.string().min(1, "validation.required").max(60, "validation.tooLong")),
  model: optionalText(60),
  modelYear: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)))
    .pipe(
      z
        .number({ error: "validation.invalidYear" })
        .int("validation.invalidYear")
        .min(1950, "validation.invalidYear")
        .max(new Date().getUTCFullYear() + 1, "validation.invalidYear")
        .optional(),
    ),
  fuelType: z
    .enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "OTHER"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  colour: optionalText(40),
  engineNumber: optionalText(30),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const newVehicleSchema = vehicleInputSchema.extend({
  plate: optionalText(20),
  ownerCustomerId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))
    .pipe(uuid.optional()),
});
export type NewVehicleInput = z.infer<typeof newVehicleSchema>;

/** Calendar date "YYYY-MM-DD" in the garage time zone; resolved to an instant by the service. */
const effectiveAt = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.invalidDate")
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "validation.invalidDate")
      .optional(),
  );

export const changeRegistrationSchema = z.object({
  plate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v) ?? "")
    .pipe(z.string().min(1, "validation.required").max(20, "validation.tooLong")),
  effectiveAt,
});

export const transferOwnershipSchema = z.object({
  toCustomerId: z
    .string({ error: "validation.customerRequired" })
    .pipe(z.uuid({ error: "validation.customerRequired" })),
  /** The ownership id the form was rendered with (optimistic concurrency); empty when none. */
  expectedOwnershipId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  effectiveAt,
  reason: z.enum(["TRANSFER", "CORRECTION"]).default("TRANSFER"),
});

export const keeperSchema = z.object({
  customerId: z
    .string({ error: "validation.customerRequired" })
    .pipe(z.uuid({ error: "validation.customerRequired" })),
  effectiveAt,
});

export const listVehiclesSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  archived: checkbox,
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
