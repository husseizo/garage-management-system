import { CalendarCheck, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:py-24">
          <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Independent automotive workshop
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Book your vehicle in, and know where it stands.
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">{siteConfig.description}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/book">
                <CalendarCheck aria-hidden />
                Book a service
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/track">
                <Search aria-hidden />
                Track a booking
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section aria-labelledby="services-heading" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="services-heading" className="mb-6 text-2xl font-semibold tracking-tight">
          What we do
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteConfig.services.map((service) => (
            <li key={service.title}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">{service.title}</CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
