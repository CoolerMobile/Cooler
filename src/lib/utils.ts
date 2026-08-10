import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * returns error message or string representation of error
 */
export function parseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
