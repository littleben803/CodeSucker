export interface WindowChromeOptions {
  frame: boolean;
  titleBarStyle?: 'hidden';
  trafficLightPosition?: { x: number; y: number };
}

/** Keep macOS window controls native while Windows/Linux retain the custom chrome. */
export function windowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      frame: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 18, y: 18 },
    };
  }

  return { frame: false };
}
