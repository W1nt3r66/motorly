import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const MAX_INVITED_FRIENDS = 9;

function profileName(profile) {
  return profile?.display_name?.trim() || profile?.username || "Motorly friend";
}

function errorMessage(error, fallback) {
  const message =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : "";

  return message && message !== "{}" ? message : fallback;
}

export default function CreateCrewScreen({
  userId,
  darkMode = true,
  onCreated,
}) {
  const colors = darkMode ? DARK : LIGHT;
  const styles = createStyles(colors);
  const [name, setName] = useState("");
  const [friends, setFriends] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (friendshipsError) throw friendshipsError;

      const friendIds = [
        ...new Set(
          (friendships || []).map((friendship) =>
            friendship.requester_id === userId
              ? friendship.addressee_id
              : friendship.requester_id,
          ),
        ),
      ];

      if (!friendIds.length) {
        setFriends([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", friendIds);

      if (profilesError) throw profilesError;

      setFriends(
        (profiles || []).sort((a, b) =>
          profileName(a).localeCompare(profileName(b)),
        ),
      );
    } catch (loadError) {
      setError(
        errorMessage(loadError, "Could not load your accepted friends."),
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const toggleFriend = (friendId) => {
    setSelectedIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((id) => id !== friendId);
      }

      if (current.length >= MAX_INVITED_FRIENDS) {
        setError("A Motorly crew can contain no more than 10 people.");
        return current;
      }

      setError("");
      return [...current, friendId];
    });
  };

  const createCrew = async () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError("Enter a crew name.");
      return;
    }

    if (!selectedIds.length) {
      setError("Choose at least one accepted friend for this crew.");
      return;
    }

    setCreating(true);
    setError("");
    let createdRoom = null;

    try {
      const { data: room, error: roomError } = await supabase
        .from("walkie_rooms")
        .insert({
          name: cleanName,
          created_by: userId,
        })
        .select()
        .single();

      if (roomError) throw roomError;
      createdRoom = room;

      const { error: membersError } = await supabase
        .from("walkie_room_members")
        .insert(
          selectedIds.map((friendId) => ({
            room_id: room.id,
            user_id: friendId,
          })),
        );

      if (membersError) throw membersError;

      onCreated?.(room);
    } catch (createError) {
      if (createdRoom?.id) {
        await supabase
          .from("walkie_rooms")
          .delete()
          .eq("id", createdRoom.id)
          .catch(() => {});
      }

      setError(
        errorMessage(
          createError,
          "The crew could not be created. Please try again.",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={25} color={colors.accent} />
        </View>
        <Text style={styles.title}>Start a crew</Text>
        <Text style={styles.subtitle}>
          Name this drive and choose up to nine accepted friends. Walkie becomes
          available only to the people in this crew.
        </Text>

        <Text style={styles.label}>Crew name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Sunday breakfast drive"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={40}
        />

        <Text style={styles.label}>
          Invite friends ({selectedIds.length}/{MAX_INVITED_FRIENDS})
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.emptyText}>Loading accepted friends…</Text>
          </View>
        ) : !friends.length ? (
          <Text style={styles.emptyText}>
            Add and accept at least one friend before starting a crew.
          </Text>
        ) : (
          <View style={styles.friendList}>
            {friends.map((friend) => {
              const selected = selectedIds.includes(friend.id);

              return (
                <Pressable
                  key={friend.id}
                  onPress={() => toggleFriend(friend.id)}
                  style={[
                    styles.friendRow,
                    selected && styles.friendRowSelected,
                  ]}
                >
                  <View style={styles.friendAvatar}>
                    <Ionicons
                      name="person"
                      size={17}
                      color={selected ? colors.onAccent : colors.accent}
                    />
                  </View>
                  <View style={styles.friendCopy}>
                    <Text
                      style={[
                        styles.friendName,
                        selected && styles.friendNameSelected,
                      ]}
                    >
                      {profileName(friend)}
                    </Text>
                    <Text
                      style={[
                        styles.friendUsername,
                        selected && styles.friendUsernameSelected,
                      ]}
                    >
                      @{friend.username}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={selected ? colors.onAccent : colors.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={createCrew}
          disabled={creating || loading || !friends.length}
          style={[
            styles.button,
            (creating || loading || !friends.length) && styles.buttonDisabled,
          ]}
        >
          {creating ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name="add" size={20} color={colors.onAccent} />
              <Text style={styles.buttonText}>Create crew</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const LIGHT = {
  background: "#F1F3F5",
  surface: "#FFFFFF",
  line: "#D5DBE1",
  text: "#20262E",
  muted: "#687482",
  accent: "#456B8C",
  accentSoft: "#DCE6EE",
  onAccent: "#FFFFFF",
  red: "#C45E5E",
  redSoft: "#F7E8E8",
};

const DARK = {
  background: "#0B0E12",
  surface: "#151B23",
  line: "#2B3542",
  text: "#E7ECF2",
  muted: "#9AA7B5",
  accent: "#8FAFD0",
  accentSoft: "#202B38",
  onAccent: "#F3F6FA",
  red: "#E07A6B",
  redSoft: "#342126",
};

function createStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 120,
    },
    card: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
    },
    title: {
      color: colors.text,
      fontSize: 25,
      fontWeight: "900",
      marginTop: 14,
    },
    subtitle: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 6,
      marginBottom: 20,
    },
    label: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "900",
      marginBottom: 8,
      marginTop: 5,
    },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 15,
      color: colors.text,
      backgroundColor: colors.background,
      marginBottom: 17,
    },
    loading: {
      minHeight: 80,
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
    },
    emptyText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19,
      paddingVertical: 15,
    },
    friendList: {
      gap: 8,
    },
    friendRow: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.background,
    },
    friendRowSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    friendAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
    },
    friendCopy: {
      flex: 1,
    },
    friendName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    friendNameSelected: {
      color: colors.onAccent,
    },
    friendUsername: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 2,
    },
    friendUsernameSelected: {
      color: colors.onAccent,
      opacity: 0.82,
    },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.redSoft,
      marginTop: 15,
    },
    errorText: {
      flex: 1,
      color: colors.red,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },
    button: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: 14,
      backgroundColor: colors.accent,
      marginTop: 18,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "900",
    },
  });
}
