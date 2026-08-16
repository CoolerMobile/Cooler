import { Accelerometer } from "expo-sensors";
import { useEffect, useRef, useState } from "react";

const FACE_DOWN_THRESHOLD = -0.85;
const FACE_UP_THRESHOLD = 0.65;
const HOLD_DURATION = 400;

export function useFlipPrivacy() {
  const [isHidden, setIsHidden] = useState(false);

  const currentOrientation = useRef<"up" | "down" | null>(null);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Accelerometer.setUpdateInterval(150);

    const subscription = Accelerometer.addListener(({ z }) => {
      const nextOrientation =
        z <= FACE_DOWN_THRESHOLD
          ? "down"
          : z >= FACE_UP_THRESHOLD
            ? "up"
            : null;

      if (
        nextOrientation === null ||
        nextOrientation === currentOrientation.current
      ) {
        return;
      }

      if (pendingTimeout.current) {
        clearTimeout(pendingTimeout.current);
      }

      pendingTimeout.current = setTimeout(() => {
        currentOrientation.current = nextOrientation;

        if (nextOrientation === "down") {
          setIsHidden((current) => !current);
        }
      }, HOLD_DURATION);
    });

    return () => {
      subscription.remove();

      if (pendingTimeout.current) {
        clearTimeout(pendingTimeout.current);
      }
    };
  }, []);

  return {
    isHidden,
    hide: () => setIsHidden(true),
    show: () => setIsHidden(false),
    toggle: () => setIsHidden((current) => !current),
  };
}
