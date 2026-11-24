import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = { title: "My vehicles" };

/**
 * Customer portal entry. Vehicle details and service history are only ever shown after the
 * customer's identity is verified (OTP — planned). Until then this page renders no customer data.
 */
export default function PortalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">My vehicles</h1>
      <p className="text-muted-foreground mb-8">
        View your vehicles, service history and upcoming reminders.
      </p>
      <EmptyState
        icon={ShieldCheck}
        title="Verified access required"
        description="To protect your information, the customer portal will ask you to confirm a one-time code sent to the phone number or email we hold for you. Portal sign-in is not available yet."
      />
    </div>
  );
}
