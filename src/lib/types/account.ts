/** coolercloud account identity */
export type CoolerCloudUser = {
  id: string
  email: string
  name?: string
}

/** active coolercloud account session */
export type CoolerCloudSession = {
  token: string
  expiresAt: string
  user: CoolerCloudUser
}

/** a coolerbridge linked to the account */
export type BridgeLink = {
  /** cloud scoped bridge id used when requesting assertions */
  cloudBridgeId: string
  name: string
  /** public base url of the self hosted bridge */
  baseUrl: string
}

/** exchanged bridge session backed by an opaque cbt token */
export type BridgeSession = {
  cloudBridgeId: string
  accessToken: string
  expiresAt: string
  scopes: string[]
}

/** device platform coolerbridge accepts */
export type DevicePlatform = "ios" | "android"

/** account store state and actions */
export type AccountState = {
  session: CoolerCloudSession | null
  bridges: BridgeLink[]
  bridgeSessions: Record<string, BridgeSession>
  /** registered device id per bridge, kept so sign out can deregister it */
  deviceIds: Record<string, string>
  hasHydrated: boolean

  // actions
  setSession: (session: CoolerCloudSession | null) => void
  setBridges: (bridges: BridgeLink[]) => void
  setBridgeSession: (session: BridgeSession) => void
  clearBridgeSession: (cloudBridgeId: string) => void
  setDeviceId: (cloudBridgeId: string, deviceId: string) => void
  reset: () => void
  setHasHydrated: (value: boolean) => void
}
