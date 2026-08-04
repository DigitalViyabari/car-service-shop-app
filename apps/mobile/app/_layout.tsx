import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileAuthProvider } from "../lib/mobile-auth";
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <StatusBar hidden />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      </MobileAuthProvider>
    </SafeAreaProvider>
  );
}
