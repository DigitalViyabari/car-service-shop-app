import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colours } from "../lib/theme";

const items = [
  { label: "Home", icon: "grid" as const, path: "/home" as const },
  { label: "Jobs", icon: "car-sport" as const, path: "/jobs" as const },
  { label: "Alerts", icon: "notifications" as const, path: "/alerts" as const },
  { label: "More", icon: "menu" as const, path: "/more" as const },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const active = pathname === item.path;
        return (
          <TouchableOpacity
            key={item.path}
            style={styles.item}
            onPress={() => router.replace(item.path)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Ionicons name={item.icon} size={25} color={active ? colours.red : colours.muted} />
            <Text style={[styles.label, active && styles.active]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: 76,
    backgroundColor: colours.card,
    borderTopColor: colours.line,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  label: { color: colours.muted, fontSize: 12, fontWeight: "800" },
  active: { color: colours.red },
});
