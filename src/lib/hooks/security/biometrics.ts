import { parseError } from "@/lib/utils";
import * as LocalAuth from "expo-local-authentication";

let authenticationRequestsInFlight = 0;

/**
 * lets app-lifecycle privacy handling distinguish a biometric prompt from the
 * user actually leaving the app
 */
export const isBiometricAuthenticationInFlight = () =>
  authenticationRequestsInFlight > 0;

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
   * validate biometrics availability through
   * hardware-level check and enrollment confirmation
   *
   * if biometrics are available, but no auth type is enrolled,
   * this will return `false` as a failsafe
   *
   * @returns true or false
   */
  const checkBioSupport = async () => {
    try {
      // hardware check
      const hasHardware = await LocalAuth.hasHardwareAsync();

      // is enrolled
      const isEnrolled = await LocalAuth.isEnrolledAsync();

      // return true only if both are verified
      return hasHardware && isEnrolled;
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  /**
   * verify enrollment level
   *
   * @returns level
   */
  const enrollmentLevel = async () => {
    try {
      return await LocalAuth.getEnrolledLevelAsync();
    } catch (error) {
      throw Error(parseError(error));
    }
  };

  /**
   * supported authentication types
   *
   * @returns array of supported auth types
   */
  const supportedTypes = async () => {
    try {
      return await LocalAuth.supportedAuthenticationTypesAsync();
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

  /**
   * authenticate using biometrics
   *
   * @param options authentication options
   *
   * @returns authentication result
   */
  const authenticate = async (
    options: LocalAuth.LocalAuthenticationOptions,
  ) => {
    authenticationRequestsInFlight += 1;

    try {
      return await LocalAuth.authenticateAsync(options);
    } catch (error) {
      throw Error(parseError(error));
    } finally {
      authenticationRequestsInFlight = Math.max(
        0,
        authenticationRequestsInFlight - 1,
      );
    }
  };

  // return methods
  return {
    checkBioSupport,
    enrollmentLevel,
    supportedTypes,
    cancelAuth,
    authenticate,
  };
};
