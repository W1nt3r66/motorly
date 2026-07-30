import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

export default function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    setError("");
    setMessage("");

    const email = form.email.trim().toLowerCase();
    const username = form.username.trim().toLowerCase();

    if (!email || !form.password) {
      setError("Enter your email and password.");
      return;
    }

    if (mode === "signup" && !/^[a-z0-9_]{3,20}$/.test(username)) {
      setError("Username must be 3–20 characters using letters, numbers or _.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setBusy(true);

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password: form.password,
            options: {
              data: {
                username,
                display_name: form.displayName.trim() || username,
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email,
            password: form.password,
          });

    setBusy(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your account.");
    }
  };

  const changeMode = () => {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    setError("");
    setMessage("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Ionicons name="speedometer" size={29} color="#20262E" />
          </View>
          <Text style={styles.brand}>motorly</Text>
        </View>

        <Text style={styles.title}>
          {mode === "signin" ? "Welcome back." : "Create your Motorly ID."}
        </Text>
        <Text style={styles.subtitle}>
          {mode === "signin"
            ? "Sign in to open your garage."
            : "Your username lets friends find and invite you."}
        </Text>

        {mode === "signup" && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Display name"
              value={form.displayName}
              onChangeText={(value) => update("displayName", value)}
            />
            <TextInput
              style={styles.input}
              placeholder="Unique username"
              autoCapitalize="none"
              value={form.username}
              onChangeText={(value) => update("username", value)}
            />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          value={form.email}
          onChangeText={(value) => update("email", value)}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={form.password}
          onChangeText={(value) => update("password", value)}
          onSubmitEditing={submit}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.message}>{message}</Text>}

        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={changeMode}>
          <Text style={styles.switchText}>
            {mode === "signin"
              ? "New to Motorly? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F1F3F5",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: "#D5DBE1",
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#D8E65A",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  brand: {
    fontSize: 31,
    fontWeight: "900",
    color: "#456B8C",
    letterSpacing: -1,
  },
  title: {
    marginTop: 28,
    fontSize: 29,
    fontWeight: "900",
    color: "#20262E",
  },
  subtitle: {
    color: "#687482",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#CBD3DA",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    color: "#20262E",
    backgroundColor: "#F7F8FA",
  },
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#456B8C",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  switchText: {
    textAlign: "center",
    color: "#456B8C",
    fontWeight: "700",
    marginTop: 20,
  },
  error: { color: "#B94242", marginBottom: 8 },
  message: { color: "#456B8C", marginBottom: 8 },
});
