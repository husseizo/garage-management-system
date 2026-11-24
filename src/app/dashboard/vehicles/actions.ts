"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  changeRegistrationSchema,
  keeperSchema,
  newVehicleSchema,
  transferOwnershipSchema,
  vehicleInputSchema,
} from "@/modules/vehicles/schemas";
import {
  archiveVehicle,
  assignKeeper,
  changeRegistration,
  createVehicle,
  endKeeper,
  transferOwnership,
  updateVehicle,
  type VehicleWarning,
} from "@/modules/vehicles/service";
import { assertPermission } from "@/server/auth/guards";
import { parseInput } from "@/server/validation";

import {
  formValues,
  isNextControlFlow,
  toActionState,
  type ActionState,
} from "../_lib/action-state";

const uuid = z.uuid();
const WARNING_KEYS: Record<VehicleWarning, string> = {
  vinCheckDigit: "vehicles.vinWarnings.checkDigit",
  plateUnusualFormat: "vehicles.plateWarnings.unusualFormat",
};
const warningParam = (w: VehicleWarning[]) => (w.length ? `&w=${w.join(",")}` : "");

export async function createVehicleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  let target: string;
  try {
    const actor = await assertPermission("vehicle.create");
    const input = parseInput(newVehicleSchema, values);
    const { id, warnings } = await createVehicle(actor, input);
    target = `/dashboard/vehicles/${id}?notice=created${warningParam(warnings)}`;
    if (input.ownerCustomerId) revalidatePath(`/dashboard/customers/${input.ownerCustomerId}`);
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return toActionState(error, values);
  }
  revalidatePath("/dashboard/vehicles");
  redirect(target);
}

export async function updateVehicleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  let target: string;
  try {
    const actor = await assertPermission("vehicle.update");
    const id = parseInput(uuid, values.id);
    const input = parseInput(vehicleInputSchema, values);
    const { warnings } = await updateVehicle(actor, id, values.updatedAt ?? "", input);
    target = `/dashboard/vehicles/${id}?notice=updated${warningParam(warnings)}`;
    revalidatePath(`/dashboard/vehicles/${id}`);
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return toActionState(error, values);
  }
  redirect(target);
}

export async function archiveVehicleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await assertPermission("vehicle.archive");
    const id = parseInput(uuid, formData.get("id"));
    await archiveVehicle(actor, id);
    revalidatePath(`/dashboard/vehicles/${id}`);
    revalidatePath("/dashboard/vehicles");
    return { ok: true, message: "vehicles.archivedDone" };
  } catch (error) {
    return toActionState(error);
  }
}

export async function changeRegistrationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const actor = await assertPermission("vehicle.registration.change");
    const vehicleId = parseInput(uuid, values.vehicleId);
    const input = parseInput(changeRegistrationSchema, values);
    const { warnings } = await changeRegistration(actor, vehicleId, input.plate, input.effectiveAt);
    revalidatePath(`/dashboard/vehicles/${vehicleId}`);
    return {
      ok: true,
      message: "vehicles.registration.changed",
      warnings: warnings.map((w) => WARNING_KEYS[w]),
    };
  } catch (error) {
    return toActionState(error, values);
  }
}

export async function transferOwnershipAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const actor = await assertPermission("vehicle.ownership.transfer");
    const vehicleId = parseInput(uuid, values.vehicleId);
    const input = parseInput(transferOwnershipSchema, values);
    await transferOwnership(actor, vehicleId, input);
    revalidatePath(`/dashboard/vehicles/${vehicleId}`);
    revalidatePath(`/dashboard/customers/${input.toCustomerId}`);
    return { ok: true, message: "vehicles.ownership.transferred" };
  } catch (error) {
    return toActionState(error, values);
  }
}

export async function assignKeeperAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const actor = await assertPermission("vehicle.ownership.transfer");
    const vehicleId = parseInput(uuid, values.vehicleId);
    const input = parseInput(keeperSchema, values);
    await assignKeeper(actor, vehicleId, input.customerId, input.effectiveAt);
    revalidatePath(`/dashboard/vehicles/${vehicleId}`);
    return { ok: true, message: "vehicles.ownership.keeperAssigned" };
  } catch (error) {
    return toActionState(error, values);
  }
}

export async function endKeeperAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await assertPermission("vehicle.ownership.transfer");
    const vehicleId = parseInput(uuid, formData.get("vehicleId"));
    const ownershipId = parseInput(uuid, formData.get("ownershipId"));
    await endKeeper(actor, vehicleId, ownershipId);
    revalidatePath(`/dashboard/vehicles/${vehicleId}`);
    return { ok: true, message: "vehicles.ownership.keeperEnded" };
  } catch (error) {
    return toActionState(error);
  }
}
