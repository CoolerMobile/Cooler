import * as SecureStore from "expo-secure-store";
import { parseError } from "@/lib/utils";

/**
 * secure storage for encrypted data
 */
export const useSecureStorage = () => {
  /**
   * validate biometrics availability
   *
   * @returns true or false
   */
  const checkBioSupport = async () => {
    return await SecureStore.isAvailableAsync();
  };

  /**
   * set `value` for `key`
   *
   * if `requireAuth` is enabled, the value will only be readable if
   * biometrics are provided. if there is a change to the device's biometrics,
   * such as **adding a new fingerprint** or changing the **face profile**, the key will be
   * *permanently* impossible to access, and its value will be lost
   *
   * @param key
   * @param value
   * @param requireAuth
   */
  const set = async (key: string, value: any, requireAuth?: boolean) => {
    try {
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: requireAuth,
      });
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  /**
   * get `value` from `key`
   *
   * @param key
   *
   * @returns value or null
   */
  const get = async (key: string): Promise<any> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  /**
   * delete `key`
   *
   * @param key
   */
  const del = async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  // return methods
  return { get, set, del, checkBioSupport };
};
