"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Brand } from "@/components/layout/brand";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { DashboardNavGroup } from "@/config/navigation";

export function DashboardMobileNav({ groups }: { groups: DashboardNavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle asChild>
            <div>
              <Brand href="/dashboard" />
            </div>
          </SheetTitle>
        </SheetHeader>
        <div className="p-3">
          <DashboardNav groups={groups} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
