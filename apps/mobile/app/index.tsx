import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
export default function LoginScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>DIGITAL VIYABARI</Text>
        <Text style={styles.title}>Your workshop, wherever you are.</Text>
        <Text style={styles.copy}>Secure access to every branch your role allows.</Text>
      </View>
      <View style={styles.form}>
        <Text style={styles.heading}>Welcome back</Text>
        <TextInput
          style={styles.input}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={() => router.push("/home")}>
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Firebase Authentication connects after project configuration.
        </Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#10233f" },
  hero: { padding: 28, paddingTop: 50 },
  eyebrow: { color: "#fb923c", fontWeight: "800", letterSpacing: 2 },
  title: { color: "white", fontSize: 38, lineHeight: 42, fontWeight: "900", marginTop: 18 },
  copy: { color: "#d9e5f4", fontSize: 16, lineHeight: 24, marginTop: 12 },
  form: {
    flex: 1,
    backgroundColor: "#f4f7fb",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
  },
  heading: { fontSize: 26, fontWeight: "800", color: "#152033", marginBottom: 14 },
  input: {
    backgroundColor: "white",
    borderColor: "#d7dde7",
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    marginTop: 12,
  },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "white", fontWeight: "800" },
  note: { color: "#667085", fontSize: 12, lineHeight: 18, marginTop: 16 },
});
