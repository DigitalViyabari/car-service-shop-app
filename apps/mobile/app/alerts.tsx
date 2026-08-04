import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileNav } from "../components/mobile-nav";
import { colours } from "../lib/theme";

export default function AlertsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WORKSHOP UPDATES</Text>
        <Text style={styles.title}>Notifications</Text>
      </View>
      <View style={styles.empty}>
        <View style={styles.icon}>
          <Ionicons name="notifications" size={34} color={colours.red} />
        </View>
        <Text style={styles.emptyTitle}>You’re up to date</Text>
        <Text style={styles.emptyText}>
          Job assignments, delays and important workshop updates will appear here.
        </Text>
      </View>
      <MobileNav />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: { padding: 20 },
  eyebrow: { color: colours.red, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: colours.ink, fontSize: 31, fontWeight: "900", marginTop: 5 },
  empty: {
    margin: 20,
    marginTop: 4,
    backgroundColor: colours.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colours.line,
    padding: 30,
    minHeight: 280,
    marginBottom: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colours.ink, fontSize: 22, fontWeight: "900", marginTop: 17 },
  emptyText: {
    color: colours.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 8,
  },
});
