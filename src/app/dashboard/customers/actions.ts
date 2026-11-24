"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addContact,
  createCustomer,
  removeContact,
  searchCustomersForPicker,
  setCustomerArchived,
  setPrimaryContact,
  updateCustomer,
} from "@/modules/customers/service";
import { contactInputSchema, customerInputSchema } from "@/modules/customers/schemas";
import { assertPermission } from "@/server/auth/guards";
import { parseInput } from "@/server/validation";

import {
  formValues,
  isNextControlFlow,
  toActionState,
  type ActionState,
} from "../_lib/action-state";

const uuid = z.uuid();

/** Server actions for customers. Each re-authenticates and checks permissions (never trusts the UI). */
export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  let id: string;
  try {
    const actor = await assertPermission("customer.create");
    const input = parseInput(customerInputSchema, values);
    const result = await createCustomer(actor, input);
    if (result.status === "duplicates") {
      return { ok: false, duplicates: result.candidates, values };
    }
    id = result.id;
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return toActionState(error, values);
  }
  revalidatePath("/dashboard/customers");
  redirect(`/dashboard/customers/${id}?notice=created`);
}

export async function updateCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  let id: string;
  try {
    const actor = await assertPermission("customer.update");
    id = parseInput(uuid, values.id);
    const input = parseInput(customerInputSchema, values);
    await updateCustomer(actor, id, values.updatedAt ?? "", input);
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return toActionState(error, values);
  }
  revalidatePath(`/dashboard/customers/${id}`);
  redirect(`/dashboard/customers/${id}?notice=updated`);
}

export async function setArchivedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await assertPermission("customer.archive");
    const id = parseInput(uuid, formData.get("id"));
    const archived = formData.get("archived") === "true";
    await setCustomerArchived(actor, id, archived);
    revalidatePath(`/dashboard/customers/${id}`);
    revalidatePath("/dashboard/customers");
    return { ok: true, message: archived ? "customers.archivedDone" : "customers.restoredDone" };
  } catch (error) {
    return toActionState(error);
  }
}

export async function addContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const actor = await assertPermission("customer.contacts.manage");
    const customerId = parseInput(uuid, values.customerId);
    const input = parseInput(contactInputSchema, values);
    const { sharedWith } = await addContact(actor, customerId, input);
    revalidatePath(`/dashboard/customers/${customerId}`);
    return {
      ok: true,
      message: "customers.contacts.added",
      warnings: sharedWith > 0 ? [`shared:${sharedWith}`] : undefined,
    };
  } catch (error) {
    return toActionState(error, values);
  }
}

export async function removeContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await assertPermission("customer.contacts.manage");
    const customerId = parseInput(uuid, formData.get("customerId"));
    const contactId = parseInput(uuid, formData.get("contactId"));
    await removeContact(actor, customerId, contactId);
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { ok: true, message: "customers.contacts.removed" };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setPrimaryContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await assertPermission("customer.contacts.manage");
    const customerId = parseInput(uuid, formData.get("customerId"));
    const contactId = parseInput(uuid, formData.get("contactId"));
    await setPrimaryContact(actor, customerId, contactId);
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

/** Typeahead for owner/keeper pickers. Returns names and masked phone hints only. */
export async function searchCustomersAction(q: string) {
  const actor = await assertPermission("customer.read");
  const query = z.string().trim().max(100).parse(q);
  return searchCustomersForPicker(actor, query);
}
