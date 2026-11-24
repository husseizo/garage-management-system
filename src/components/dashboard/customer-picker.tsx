"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { searchCustomersAction } from "@/app/dashboard/customers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

type Option = {
  id: string;
  displayName: string;
  kind: "INDIVIDUAL" | "COMPANY";
  hint: string | null;
};

/**
 * Accessible customer typeahead. Calls a permission-checked server action; results contain names
 * and masked phone hints only. The chosen id is submitted in a hidden input named `name`.
 */
export function CustomerPicker({
  id,
  name,
  initial,
  invalid,
  describedBy,
}: {
  id?: string;
  name: string;
  initial?: { id: string; displayName: string } | null;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useT();
  const listId = useId();
  const [selected, setSelected] = useState(initial ?? null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(-1);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const n = ++seq.current;
    if (value.trim().length < 2) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await searchCustomersAction(value);
          if (n === seq.current) {
            setOptions(result);
            setActive(-1);
          }
        } catch {
          if (n === seq.current) setOptions([]);
        }
      });
    }, 250);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <input type="hidden" name={name} value={selected.id} />
        <span>{t("search.selected", { name: selected.displayName })}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
          {t("search.change")}
        </Button>
      </div>
    );
  }

  const choose = (o: Option) => {
    seq.current++;
    setSelected({ id: o.id, displayName: o.displayName });
    setQuery("");
    setOptions([]);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <Search
        className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
        aria-hidden
      />
      <Input
        id={id}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="pl-8"
        placeholder={t("search.pickerPlaceholder")}
        value={query}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0 && options[active]) {
            e.preventDefault();
            choose(options[active]);
          }
        }}
        autoComplete="off"
      />
      {query.trim().length >= 2 && !pending && options.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-xs">{t("search.pickerEmpty")}</p>
      ) : null}
      {options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border p-1 shadow-md"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer rounded px-2 py-1.5 text-sm ${i === active ? "bg-accent" : "hover:bg-accent/60"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              <span className="font-medium">{o.displayName}</span>
              <span className="text-muted-foreground ml-2 text-xs">
                {t(`customers.kind.${o.kind}`)}
                {o.hint ? ` · ${o.hint}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
