import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MobileNav } from "../components/mobile-nav";
import { useMobileAuth } from "../lib/mobile-auth";
import { colours } from "../lib/theme";

export default function MoreScreen() {
  const { profile, company, branch, signOutUser } = useMobileAuth();
  function confirmLogout() {
    Alert.alert("Log out?", "Are you sure you want to log out?", [
      { text: "Stay Signed In", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => void signOutUser().then(() => router.replace("/")),
      },
    ]);
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>More</Text>
      </View>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() ?? "U"}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.name}>{profile?.displayName ?? "Workshop User"}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
        </View>
      </View>
      <View style={styles.workspace}>
        <Ionicons name="business" size={25} color={colours.navy} />
        <View>
          <Text style={styles.workspaceLabel}>WORKSPACE</Text>
          <Text style={styles.workspaceName}>{company?.name}</Text>
          <Text style={styles.branch}>{branch?.name}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.logout} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={25} color={colours.red} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
      <MobileNav />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: { padding: 20 },
  eyebrow: { color: colours.red, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: colours.ink, fontSize: 31, fontWeight: "900", marginTop: 5 },
  profile: {
    marginHorizontal: 20,
    backgroundColor: colours.ink,
    borderRadius: 22,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  profileText: { flex: 1 },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  email: { color: "#B9C3CD", fontSize: 14, marginTop: 4 },
  workspace: {
    margin: 20,
    backgroundColor: colours.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colours.line,
    padding: 18,
    flexDirection: "row",
    gap: 14,
  },
  workspaceLabel: { color: colours.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  workspaceName: { color: colours.ink, fontSize: 17, fontWeight: "900", marginTop: 3 },
  branch: { color: colours.muted, fontSize: 14, marginTop: 2 },
  logout: {
    height: 62,
    marginHorizontal: 20,
    backgroundColor: "#FDEBEC",
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 96,
  },
  logoutText: { color: colours.red, fontSize: 17, fontWeight: "900" },
});
