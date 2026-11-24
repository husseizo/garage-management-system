import { z } from "zod";

import { cleanText, normalizeTaxId } from "./normalize";

/**
 * Customer input schemas. Error messages are i18n keys (`validation.*`), translated by the UI.
 * Phone/email normalisation needs the garage region, so it happens in the service.
 */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v))
    .pipe(z.string().max(max, "validation.tooLong").optional());

/** HTML checkbox: "on"/"true"/true → true; missing or anything else → false. */
export const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const common = {
  preferredLanguage: z.enum(["sw", "en"]).default("sw"),
  notes: optionalText(2000),
  phone: optionalText(32),
  phoneLabel: optionalText(50),
  email: optionalText(254),
  contactPerson: optionalText(100),
  confirmDuplicates: checkbox,
};

export const individualSchema = z
  .object({
    kind: z.literal("INDIVIDUAL"),
    givenName: optionalText(100),
    familyName: optionalText(100),
    ...common,
  })
  .refine((v) => v.givenName || v.familyName, {
    message: "validation.nameRequired",
    path: ["givenName"],
  });

export const companySchema = z.object({
  kind: z.literal("COMPANY"),
  companyName: z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v) ?? "")
    .pipe(z.string().min(1, "validation.companyNameRequired").max(200, "validation.tooLong")),
  taxId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => normalizeTaxId(v))
    .pipe(
      z
        .string()
        .regex(/^[0-9A-Z]{3,20}$/, "validation.invalidTaxId")
        .optional(),
    ),
  ...common,
});

export const customerInputSchema = z.discriminatedUnion("kind", [individualSchema, companySchema]);
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const contactInputSchema = z.object({
  kind: z.enum(["PHONE", "EMAIL"]),
  value: z
    .string()
    .optional()
    .nullable()
    .transform((v) => cleanText(v) ?? "")
    .pipe(z.string().min(1, "validation.required").max(254, "validation.tooLong")),
  label: optionalText(50),
  contactPersonName: optionalText(100),
  isPrimary: checkbox,
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const listCustomersSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  kind: z.enum(["INDIVIDUAL", "COMPANY"]).optional().catch(undefined),
  archived: checkbox,
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
