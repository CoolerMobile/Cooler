import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import type { StateStorage } from "zustand/middleware"
import { parseError } from "@/lib/utils"

/**
 * zustand-compatible encrypted storage
 *
 * shared persistence adapter so AsyncStorage remains
 * reserved for non-sensitive theme preference
 */
export const secureStorage: StateStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
}

/**
 * secure persistence with a one-time migration from
 * the stores' former AsyncStorage values
 *
 * new and updated values are written only to SecureStore,
 * and the plaintext legacy value is removed after a successful secure write
 */
export const migratingSecureStorage: StateStorage = {
  getItem: async (key) => {
    const secureValue = await secureStorage.getItem(key)
    if (secureValue !== null) {
      await AsyncStorage.removeItem(key)
      return secureValue
    }

    const legacyValue = await AsyncStorage.getItem(key)
    if (legacyValue === null) return null

    await secureStorage.setItem(key, legacyValue)
    await AsyncStorage.removeItem(key)
    return legacyValue
  },
  setItem: async (key, value) => {
    await secureStorage.setItem(key, value)
    await AsyncStorage.removeItem(key)
  },
  removeItem: async (key) => {
    await secureStorage.removeItem(key)
    await AsyncStorage.removeItem(key)
  },
}

/**
 * secure storage for encrypted data
 */
export const useSecureStorage = () => {
  /**
   * validate SecureStore availability
   *
   * @returns true or false
   */
  const checkSupport = async () => {
    return await SecureStore.isAvailableAsync()
  }

  /**
   * set `value` for `key`
   *
   * if `requireAuth` is enabled, the value will only be readable if
   * biometrics are provided. if there is a change to the device's biometrics,
   * such as **adding a new fingerprint** or changing the **face profile**, the key will be
   * *permanently* impossible to access, and its value will be lost
   *
   * by default, `requireAuth` is **enabled**
   *
   * @param key
   * @param value
   * @param requireAuth
   *
   * @returns whether the value was set or not
   */
  const set = async (key: string, value: any, requireAuth: boolean = true) => {
    try {
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: requireAuth,
      })

      return true
    } catch (error) {
      throw Error(parseError(error))
    }
  }

  /**
   * get `value` from `key`
   *
   * @param key
   *
   * @returns value or null
   */
  const get = async (key: string): Promise<any> => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      throw Error(parseError(error))
    }
  }

  /**
   * delete `key`
   *
   * @param key
   */
  const del = async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch (error) {
      throw Error(parseError(error))
    }
  }

  // return methods
  return { checkSupport, get, set, del }
}
