import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = { title: "Book a service" };

export default function BookPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Book a service</h1>
      <p className="text-muted-foreground mb-8">
        Request an appointment without creating an account. We confirm every request before it is
        booked in.
      </p>
      <EmptyState
        icon={CalendarCheck}
        title="Online booking is not open yet"
        description="Guest booking — choosing a service, entering your vehicle details and picking an available slot — is being built. Please contact the workshop directly in the meantime."
      />
    </div>
  );
}
