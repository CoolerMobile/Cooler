import { NativeStackNavigationOptions } from "expo-router";

export const useScreenOptions = () => {
  /**
   * default screen options
   */
  const defaultOptions: NativeStackNavigationOptions = {
    headerShown: true,
    headerTransparent: false,
    headerShadowVisible: false,
  };

  // options
  const options = (options: NativeStackNavigationOptions) => {
    return { ...defaultOptions, ...options };
  };

  // return methods
  return { options };
};
