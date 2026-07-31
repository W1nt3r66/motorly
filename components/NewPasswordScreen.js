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

export default function NewPasswordScreen({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const savePassword = async () => {
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || "Could not update your password.");
      return;
    }

    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    onComplete?.();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <View style={styles.logo}>
          <Ionicons name="key-outline" size={28} color="#20262E" />
        </View>
        <Text style={styles.brand}>motorly</Text>
        <Text style={styles.title}>Choose a new password.</Text>
        <Text style={styles.subtitle}>
          Use at least eight characters and keep it unique to Motorly.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#778493"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoFocus
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#778493"
          secureTextEntry
          value={confirmation}
          onChangeText={setConfirmation}
          onSubmitEditing={savePassword}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={savePassword}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Update password</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0B0E12",
    alignItems: "center",
    justifyContent: "center",
  },
  card: { width: "100%", maxWidth: 430, padding: 28 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#D8E65A",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "#8FAFD0",
    fontSize: 29,
    fontWeight: "900",
    marginTop: 12,
  },
  title: {
    color: "#E7ECF2",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 28,
  },
  subtitle: {
    color: "#9AA7B5",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#344252",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    color: "#E7ECF2",
    backgroundColor: "#101720",
  },
  error: { color: "#E07A6B", marginBottom: 8 },
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
});
