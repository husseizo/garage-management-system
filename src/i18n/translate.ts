import type { en } from "./messages/en";

/** Widen the English literal types so other locales can supply their own strings. */
type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : { readonly [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;

/** Dotted paths to string leaves, e.g. "customers.fields.givenName". */
type StringPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly string[]
      ? never
      : StringPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dotted paths to string-array leaves, e.g. "sections.bookings.planned". */
type ListPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends readonly string[]
    ? `${P}${K}`
    : T[K] extends string
      ? never
      : ListPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = StringPaths<typeof en>;
export type MessageListKey = ListPaths<typeof en>;
export type TranslateParams = Record<string, string | number>;

export interface Translator {
  (key: MessageKey, params?: TranslateParams): string;
  /** Translate a key that is only known at runtime (e.g. an audit action); falls back to `fallback`. */
  dynamic(key: string, fallback: string, params?: TranslateParams): string;
  list(key: MessageListKey): readonly string[];
}

function lookup(messages: unknown, key: string): unknown {
  let node: unknown = messages;
  for (const part of splitKey(key)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Splits "a.b.c" but keeps dotted leaf keys such as activity.actions["customer.created"]. */
function splitKey(key: string): string[] {
  const marker = "activity.actions.";
  if (key.startsWith(marker)) return ["activity", "actions", key.slice(marker.length)];
  return key.split(".");
}

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function createTranslator(messages: Messages, fallback?: Messages): Translator {
  const resolve = (key: string): unknown => {
    const value = lookup(messages, key);
    return value === undefined && fallback ? lookup(fallback, key) : value;
  };
  const t = ((key: MessageKey, params?: TranslateParams) => {
    const value = resolve(key);
    return typeof value === "string" ? interpolate(value, params) : key;
  }) as Translator;
  t.dynamic = (key, fb, params) => {
    const value = resolve(key);
    return interpolate(typeof value === "string" ? value : fb, params);
  };
  t.list = (key) => {
    const value = resolve(key);
    return Array.isArray(value) ? (value as string[]) : [];
  };
  return t;
}
