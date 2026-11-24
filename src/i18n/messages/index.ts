import type { Locale } from "../config";
import type { Messages } from "../translate";
import { en } from "./en";
import { sw } from "./sw";

export const MESSAGES: Record<Locale, Messages> = { en, sw };
