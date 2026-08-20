import { clsx, type ClassValue } from "clsx"
import { Platform } from "react-native"
import { twMerge } from "tailwind-merge"
import normalize from "normalize-url"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * returns error message or string representation of error
 */
export function parseError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * capitalize first character of given string
 *
 * @param data - string to modify
 */
export const upperFirstLetter = (data: string = "") => {
  return data.slice(0, 1).toUpperCase() + data.slice(1, data.length)
}

/**
 * checks whether the current platform is apple or android
 */
export const isAppleDevice = () => {
  return Platform.OS === "ios"
}

/**
 * normalize `url`
 *
 * @param url
 */
export const normalizeUrl = (url: string) => {
  return normalize(url, {
    defaultProtocol: "https",
    forceHttps: true,
    removeDirectoryIndex: true,
    removePath: true,
  })
}
