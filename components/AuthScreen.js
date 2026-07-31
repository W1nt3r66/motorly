import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

function readableAuthError(error, mode) {
  const message =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message.trim()
        : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("already registered")) {
    return "An account already exists for this email. Try signing in instead.";
  }

  if (
    normalized.includes("duplicate") ||
    normalized.includes("username") ||
    normalized.includes("database error saving new user")
  ) {
    return "That username may already be taken. Try a different unique username.";
  }

  if (normalized.includes("rate limit")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (message && message !== "{}" && message !== "[object Object]") {
    return message;
  }

  return mode === "signup"
    ? "The account could not be created. Try another username or email."
    : "Sign-in failed. Check your details and try again.";
}

export default function AuthScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 500;
  const usernameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
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

  const focusInput = (inputRef) => {
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const focusNextOnTab = (event, nextRef) => {
    const key = event.nativeEvent.key;

    if ((key === "Tab" || key === "\t") && !event.nativeEvent.shiftKey) {
      event.preventDefault();
      focusInput(nextRef);
    }
  };

  const updateAndFocusNextOnTab = (field, value, nextRef) => {
    const valueWithoutTabs = value.replace(/\t/g, "");

    update(field, valueWithoutTabs);

    // Some native keyboards insert a tab without emitting an onKeyPress event.
    if (valueWithoutTabs !== value) {
      focusInput(nextRef);
    }
  };

  const submit = async () => {
    setError("");
    setMessage("");

    const email = form.email.trim().toLowerCase();
    const username = form.username.trim().toLowerCase();

    if (mode === "forgot") {
      if (!email) {
        setError("Enter your email address.");
        return;
      }

      setBusy(true);
      try {
        const redirectTo =
          Platform.OS === "web"
            ? `${window.location.origin}/?passwordRecovery=1`
            : undefined;
        const { error: resetError } =
          await supabase.auth.resetPasswordForEmail(email, { redirectTo });

        if (resetError) {
          setError(readableAuthError(resetError, mode));
          return;
        }

        setMessage(
          "If that email belongs to a Motorly account, a reset link is on its way.",
        );
      } catch (resetError) {
        setError(readableAuthError(resetError, mode));
      } finally {
        setBusy(false);
      }
      return;
    }

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

    try {
      if (mode === "signup") {
        const { data: usernameAvailable, error: availabilityError } =
          await supabase.rpc("is_username_available", {
            candidate: username,
          });

        if (availabilityError) {
          setError(
            "Motorly could not check that username. Please try again.",
          );
          return;
        }

        if (!usernameAvailable) {
          setError("That username is already taken. Try another one.");
          return;
        }
      }

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

      if (result.error) {
        setError(readableAuthError(result.error, mode));
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Account created. Check your email to confirm your account.");
      }
    } catch (submitError) {
      setError(readableAuthError(submitError, mode));
    } finally {
      setBusy(false);
    }
  };

  const changeMode = () => {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    setError("");
    setMessage("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              compact && styles.cardCompact,
              compact && { width: Math.max(width - 24, 280) },
            ]}
          >
            <View style={styles.brandRow}>
              <View style={[styles.logo, compact && styles.logoCompact]}>
                <Ionicons
                  name="speedometer"
                  size={compact ? 25 : 29}
                  color="#20262E"
                />
              </View>
              <Text style={[styles.brand, compact && styles.brandCompact]}>
                motorly
              </Text>
            </View>

            <Text style={[styles.title, compact && styles.titleCompact]}>
              {mode === "signin"
                ? "Welcome back."
                : mode === "signup"
                  ? "Create your Motorly ID."
                  : "Reset your password."}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "signin"
                ? "Sign in to open your garage."
                : mode === "signup"
                  ? "Your username lets friends find and invite you."
                  : "We’ll email you a secure link to choose a new password."}
            </Text>

            {mode === "signup" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Display name"
                  placeholderTextColor="#778493"
                  value={form.displayName}
                  onChangeText={(value) =>
                    updateAndFocusNextOnTab("displayName", value, usernameRef)
                  }
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onKeyPress={(event) => focusNextOnTab(event, usernameRef)}
                  onSubmitEditing={() => focusInput(usernameRef)}
                />
                <TextInput
                  ref={usernameRef}
                  style={styles.input}
                  placeholder="Unique username"
                  placeholderTextColor="#778493"
                  autoCapitalize="none"
                  value={form.username}
                  onChangeText={(value) =>
                    updateAndFocusNextOnTab("username", value, emailRef)
                  }
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onKeyPress={(event) => focusNextOnTab(event, emailRef)}
                  onSubmitEditing={() => focusInput(emailRef)}
                />
              </>
            )}

            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#778493"
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={(value) =>
                updateAndFocusNextOnTab("email", value, passwordRef)
              }
              returnKeyType="next"
              blurOnSubmit={false}
              onKeyPress={(event) => focusNextOnTab(event, passwordRef)}
              onSubmitEditing={() => focusInput(passwordRef)}
            />

            {mode !== "forgot" && (
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#778493"
                secureTextEntry
                value={form.password}
                onChangeText={(value) => update("password", value)}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            )}

            {mode === "signin" && (
              <Pressable
                onPress={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

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
                  {mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : "Send reset link"}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={
                mode === "forgot"
                  ? () => {
                      setMode("signin");
                      setError("");
                      setMessage("");
                    }
                  : changeMode
              }
            >
              <Text style={styles.switchText}>
                {mode === "forgot"
                  ? "Back to sign in"
                  : mode === "signin"
                  ? "New to Motorly? Create an account"
                  : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0B0E12",
  },
  keyboard: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 430,
    padding: 32,
  },
  cardCompact: { padding: 20 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#D8E65A",
    alignItems: "center",
    justifyContent: "center",
  },
  logoCompact: { width: 50, height: 50, borderRadius: 16 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  brand: {
    fontSize: 31,
    fontWeight: "900",
    color: "#8FAFD0",
    letterSpacing: -1,
  },
  brandCompact: { fontSize: 27 },
  title: {
    marginTop: 28,
    fontSize: 29,
    fontWeight: "900",
    color: "#E7ECF2",
  },
  titleCompact: { fontSize: 26, marginTop: 24 },
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
    color: "#8FAFD0",
    fontWeight: "700",
    marginTop: 20,
  },
  forgotText: {
    alignSelf: "flex-end",
    color: "#8FAFD0",
    fontWeight: "700",
    marginTop: -2,
    marginBottom: 4,
  },
  error: { color: "#E07A6B", marginBottom: 8 },
  message: { color: "#8FAFD0", marginBottom: 8 },
});
