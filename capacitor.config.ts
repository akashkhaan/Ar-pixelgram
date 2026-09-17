import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arpixelgram.app',
  appName: 'AR Pixelgram',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    url: 'https://ar-pixelgram.vercel.app',
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['ar-pixelgram.vercel.app', '*.supabase.co', '*'],
  },
};

export default config;
