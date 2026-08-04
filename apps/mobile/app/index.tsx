import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { firebase } from "../lib/firebase";
import { useMobileAuth } from "../lib/mobile-auth";
import { colours } from "../lib/theme";

export default function LoginScreen() {
  const { user, loading } = useMobileAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [loading, user]);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebase.auth, email.trim(), password);
      router.replace("/home");
    } catch {
      setError("Email or password is incorrect.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.brandBlock}>
          <View style={styles.brandIcon}>
            <Ionicons name="car-sport" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.brand}>DIGITAL VIYABARI</Text>
          <Text style={styles.title}>Workshop control in your hand.</Text>
          <Text style={styles.subtitle}>Fast, clear and built for daily service work.</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.help}>Use your workshop account.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            secureTextEntry
            editable={!submitting}
            onSubmitEditing={() => void submit()}
          />
          <TouchableOpacity
            style={[styles.button, submitting && styles.disabled]}
            onPress={() => void submit()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.buttonText}>Open Workshop</Text>
                <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.ink },
  brandBlock: { paddingHorizontal: 26, paddingTop: 38, paddingBottom: 30 },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#FFFFFF", fontSize: 34, lineHeight: 39, fontWeight: "900", marginTop: 18 },
  subtitle: { color: "#B9C3CD", fontSize: 17, lineHeight: 24, marginTop: 10 },
  form: {
    flex: 1,
    backgroundColor: colours.canvas,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 26,
  },
  heading: { color: colours.ink, fontSize: 30, fontWeight: "900" },
  help: { color: colours.muted, fontSize: 16, marginTop: 4, marginBottom: 8 },
  error: {
    color: "#A82024",
    backgroundColor: "#FDEBEC",
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
  },
  label: { color: colours.ink, fontSize: 16, fontWeight: "800", marginTop: 17, marginBottom: 7 },
  input: {
    height: 58,
    backgroundColor: colours.card,
    borderColor: colours.line,
    borderWidth: 1.5,
    borderRadius: 15,
    paddingHorizontal: 16,
    color: colours.ink,
    fontSize: 17,
  },
  button: {
    height: 60,
    backgroundColor: colours.red,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
});
