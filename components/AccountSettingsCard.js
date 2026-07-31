import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const PRIVACY_SECTIONS = [
  [
    "Information Motorly uses",
    "Motorly stores your account details, profile, vehicles, fuel and service records, receipt and odometer images, friendships, crew membership, push subscription details, toll reports, and short walkie-talkie recordings needed to provide the features you choose.",
  ],
  [
    "How it is used",
    "This information powers your garage, calculations, history, friend and crew features, notifications, receipt and odometer recognition, and route estimates. Motorly does not sell your personal information.",
  ],
  [
    "Service providers",
    "Motorly uses Supabase for authentication, database, storage, realtime features and server functions; Cloudflare Pages for hosting; Google Gemini for image understanding when you request it; and OpenRouteService for routes. Those providers process the information sent to their services under their own terms.",
  ],
  [
    "Crew audio",
    "Walkie-talkie recordings are available only to the active crew. When the crew owner closes the crew, Motorly is designed to remove its messages and associated audio. Network or backup systems may retain temporary copies for a limited period.",
  ],
  [
    "Your choices",
    "You can correct garage records, control browser notification and microphone permissions, leave or close a crew, and permanently delete your Motorly account from Owner details.",
  ],
  [
    "Contact",
    "Questions about privacy can be sent to motorly.support@gmail.com.",
  ],
];

const TERMS_SECTIONS = [
  [
    "Using Motorly",
    "You must provide accurate account information, keep your login secure, and use Motorly lawfully. Do not misuse the service, access another person’s account, upload harmful material, or disrupt other users.",
  ],
  [
    "Driving safety",
    "Never interact with Motorly while driving when it is unsafe or unlawful. Ask a passenger to operate the device whenever possible. Route times, tolls, mileage, OCR results and calculations are estimates and must be checked before relying on them.",
  ],
  [
    "Friends and crews",
    "Only invite people you know and trust. Crew communication is temporary and is not an emergency service. Motorly cannot guarantee uninterrupted, immediate or error-free delivery of audio or notifications.",
  ],
  [
    "Your content",
    "You retain ownership of information and images you upload. You give Motorly permission to process them only as needed to operate and improve the features you request.",
  ],
  [
    "Availability",
    "Motorly is provided as available without a promise that every feature will always be uninterrupted or error-free. Features may change as the product develops.",
  ],
  [
    "Contact",
    "Questions about these terms can be sent to motorly.support@gmail.com.",
  ],
];

function LegalModal({ type, visible, onClose, darkMode }) {
  const privacy = type === "privacy";
  const sections = privacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const palette = darkMode
    ? {
        background: "#0B0E12",
        card: "#151B23",
        text: "#E7ECF2",
        muted: "#9AA7B5",
        line: "#2B3542",
      }
    : {
        background: "#F1F3F5",
        card: "#FFFFFF",
        text: "#20262E",
        muted: "#687482",
        line: "#D5DBE1",
      };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.legalSafe, { backgroundColor: palette.background }]}>
        <View style={[styles.legalHeader, { borderBottomColor: palette.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.legalEyebrow, { color: palette.muted }]}>
              MOTORLY
            </Text>
            <Text style={[styles.legalTitle, { color: palette.text }]}>
              {privacy ? "Privacy Policy" : "Terms of Use"}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close"
            onPress={onClose}
            style={[styles.closeButton, { borderColor: palette.line }]}
          >
            <Ionicons name="close" size={24} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.legalContent}>
          <Text style={[styles.updatedText, { color: palette.muted }]}>
            Effective 31 July 2026
          </Text>
          {sections.map(([heading, body]) => (
            <View
              key={heading}
              style={[
                styles.legalSection,
                { backgroundColor: palette.card, borderColor: palette.line },
              ]}
            >
              <Text style={[styles.legalHeading, { color: palette.text }]}>
                {heading}
              </Text>
              <Text style={[styles.legalBody, { color: palette.muted }]}>
                {body}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AccountSettingsCard({ darkMode }) {
  const [legalPage, setLegalPage] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const palette = darkMode
    ? {
        card: "#151B23",
        text: "#E7ECF2",
        muted: "#9AA7B5",
        line: "#2B3542",
        field: "#101720",
      }
    : {
        card: "#FFFFFF",
        text: "#20262E",
        muted: "#687482",
        line: "#D5DBE1",
        field: "#F1F3F5",
      };

  const deleteAccount = async () => {
    if (confirmation !== "DELETE") return;
    setBusy(true);
    setError("");

    const { error: deleteError } =
      await supabase.functions.invoke("delete-account");

    if (deleteError) {
      setError(deleteError.message || "Could not delete your account.");
      setBusy(false);
      return;
    }

    await supabase.auth.signOut();
  };

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.line },
        ]}
      >
        <Text style={[styles.title, { color: palette.text }]}>
          Account and legal
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Review Motorly’s policies or permanently remove your account.
        </Text>

        <View style={styles.linkRow}>
          <Pressable
            style={[styles.linkButton, { borderColor: palette.line }]}
            onPress={() => setLegalPage("privacy")}
          >
            <Ionicons name="shield-checkmark-outline" size={19} color="#456B8C" />
            <Text style={styles.linkText}>Privacy Policy</Text>
          </Pressable>
          <Pressable
            style={[styles.linkButton, { borderColor: palette.line }]}
            onPress={() => setLegalPage("terms")}
          >
            <Ionicons name="document-text-outline" size={19} color="#456B8C" />
            <Text style={styles.linkText}>Terms of Use</Text>
          </Pressable>
        </View>

        {!deleteOpen ? (
          <Pressable
            style={styles.deleteLink}
            onPress={() => setDeleteOpen(true)}
          >
            <Ionicons name="trash-outline" size={18} color="#C45E5E" />
            <Text style={styles.deleteLinkText}>Delete my account</Text>
          </Pressable>
        ) : (
          <View
            style={[
              styles.deletePanel,
              { borderColor: palette.line, backgroundColor: palette.field },
            ]}
          >
            <Text style={[styles.deleteTitle, { color: palette.text }]}>
              Permanently delete this account?
            </Text>
            <Text style={[styles.deleteBody, { color: palette.muted }]}>
              This removes your profile, garage, records, friendships and crew
              access. This cannot be undone. Type DELETE to continue.
            </Text>
            <TextInput
              style={[
                styles.deleteInput,
                {
                  color: palette.text,
                  borderColor: palette.line,
                  backgroundColor: palette.card,
                },
              ]}
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              placeholder="Type DELETE"
              placeholderTextColor={palette.muted}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.cancelButton, { borderColor: palette.line }]}
                onPress={() => {
                  setDeleteOpen(false);
                  setConfirmation("");
                  setError("");
                }}
                disabled={busy}
              >
                <Text style={[styles.cancelText, { color: palette.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmDeleteButton,
                  confirmation !== "DELETE" && styles.disabled,
                ]}
                onPress={deleteAccount}
                disabled={confirmation !== "DELETE" || busy}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Delete permanently</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <LegalModal
        type={legalPage}
        visible={!!legalPage}
        onClose={() => setLegalPage(null)}
        darkMode={darkMode}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    marginTop: 18,
  },
  title: { fontSize: 21, fontWeight: "900" },
  subtitle: { marginTop: 5, lineHeight: 20 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  linkButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkText: { color: "#456B8C", fontWeight: "800" },
  deleteLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 20,
    paddingVertical: 8,
  },
  deleteLinkText: { color: "#C45E5E", fontWeight: "800" },
  deletePanel: { marginTop: 18, borderWidth: 1, borderRadius: 16, padding: 16 },
  deleteTitle: { fontWeight: "900", fontSize: 17 },
  deleteBody: { lineHeight: 20, marginTop: 7 },
  deleteInput: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  deleteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  cancelButton: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontWeight: "800" },
  confirmDeleteButton: {
    minWidth: 160,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C45E5E",
  },
  confirmDeleteText: { color: "#FFFFFF", fontWeight: "900" },
  disabled: { opacity: 0.45 },
  error: { color: "#E07A6B", marginTop: 10 },
  legalSafe: { flex: 1 },
  legalHeader: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  legalEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  legalTitle: { fontSize: 27, fontWeight: "900", marginTop: 3 },
  closeButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  legalContent: {
    width: "100%",
    maxWidth: 780,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 50,
  },
  updatedText: { marginBottom: 14 },
  legalSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  legalHeading: { fontSize: 17, fontWeight: "900", marginBottom: 7 },
  legalBody: { fontSize: 14, lineHeight: 22 },
});
