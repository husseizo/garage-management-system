import { Search } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = { title: "Track a booking" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Track a booking</h1>
      <p className="text-muted-foreground mb-8">
        Check the status of an appointment using your booking reference.
      </p>
      <EmptyState
        icon={Search}
        title="Booking tracking is not available yet"
        description="Once online booking opens, you will be able to look up your appointment with a booking reference and a one-time verification code."
      />
    </div>
  );
}
