import * as SecureStore from "expo-secure-store";
import * as LocalAuth from "expo-local-authentication";
import { parseError } from "@/lib/utils";

/**
 * biometrics hook for:
 *
 * - verifying availability
 * - unlocking system
 * - arbitrary lock system
 * - cancel auth flow
 */
export const useBiometrics = () => {
  /**
   * validate biometrics availability
   *
   * @returns true or false
   */
  const checkBioSupport = async () => {
    return await SecureStore.isAvailableAsync();
  };

  /**
   * verify enrollment level
   *
   * @returns level
   */
  const enrollmentLevel = async (): Promise<LocalAuth.SecurityLevel> => {
    try {
      return await LocalAuth.getEnrolledLevelAsync();
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  /**
   * cancel authentication flow
   */
  const cancelAuth = async () => {
    return await LocalAuth.cancelAuthenticate();
  };
};
