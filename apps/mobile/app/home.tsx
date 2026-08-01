import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
const Card = ({ label }: { label: string }) => (
  <View style={styles.card}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.metric}>—</Text>
    <Text style={styles.empty}>No data connected</Text>
  </View>
);
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.branch}>ANNA NAGAR BRANCH · ACTIVE</Text>
        <Text style={styles.title}>Workshop overview</Text>
        <Text style={styles.sub}>Protected mobile shell</Text>
        <Card label="Jobs today" />
        <Card label="Vehicles in service" />
        <Card label="Branch revenue" />
      </ScrollView>
      <View style={styles.nav}>
        <Text>Home</Text>
        <Text>Jobs</Text>
        <Text>Stock</Text>
        <Text>More</Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f7fb" },
  content: { padding: 20, paddingBottom: 90 },
  branch: { color: "#067647", fontSize: 12, fontWeight: "800" },
  title: { fontSize: 30, fontWeight: "900", color: "#152033", marginTop: 8 },
  sub: { color: "#667085", marginBottom: 14 },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e4e9f0",
  },
  label: { color: "#667085" },
  metric: { fontSize: 32, fontWeight: "900", marginTop: 10 },
  empty: { color: "#667085" },
  nav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderColor: "#e4e9f0",
  },
});
