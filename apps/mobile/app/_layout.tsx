import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MobileAuthProvider } from "../lib/mobile-auth";
export default function RootLayout() {
  return (
    <MobileAuthProvider>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </MobileAuthProvider>
  );
}
