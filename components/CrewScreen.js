import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FriendsScreen from "./FriendsScreen";
import WalkieScreen from "./WalkieScreen";
import CreateCrewScreen from "./CreateCrewScreen";
import { supabase } from "../lib/supabase";

export default function CrewScreen({ userId, darkMode = true }) {
  const colors = darkMode ? DARK : LIGHT;
  const styles = createStyles(colors);
  const [section, setSection] = useState("friends");
  const [activeRoom, setActiveRoom] = useState(null);
  // Show Start crew immediately for the common no-room state. If membership
  // exists, the first room response replaces it with the Friends/Walkie tabs.
  const [membershipChecked, setMembershipChecked] = useState(true);

  const loadActiveRoom = useCallback(async () => {
    const { data: membership, error: membershipError } = await supabase
      .from("walkie_room_members")
      .select("room_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      setMembershipChecked(false);
      return;
    }

    if (!membership?.room_id) {
      setActiveRoom(null);
      setSection((current) => (current === "walkie" ? "friends" : current));
      setMembershipChecked(true);
      return;
    }

    const { data: room } = await supabase
      .from("walkie_rooms")
      .select("*")
      .eq("id", membership.room_id)
      .maybeSingle();

    setActiveRoom(room || null);
    setSection((current) =>
      room ? current : current === "walkie" ? "friends" : current,
    );
    setMembershipChecked(true);
  }, [userId]);

  useEffect(() => {
    loadActiveRoom();

    // Realtime remains the primary update path. This short fallback refresh
    // covers browsers that temporarily suspend or miss a websocket event.
    const membershipRefresh = setInterval(loadActiveRoom, 1500);
    const channel = supabase
      .channel(`motorly-crew-membership-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walkie_room_members",
          filter: `user_id=eq.${userId}`,
        },
        loadActiveRoom,
      )
      .subscribe();

    return () => {
      clearInterval(membershipRefresh);
      supabase.removeChannel(channel);
    };
  }, [loadActiveRoom, userId]);

  const handleRoomChange = useCallback((room) => {
    setActiveRoom(room || null);
    setSection((current) =>
      room ? "walkie" : current === "walkie" ? "friends" : current,
    );
  }, []);

  const handleCrewCreated = useCallback((room) => {
    setActiveRoom(room);
    setMembershipChecked(true);
    setSection("walkie");
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Crew</Text>
            <Text style={styles.subtitle}>
              Friends and private drive communication.
            </Text>
          </View>

          {membershipChecked && !activeRoom && (
            <Pressable
              onPress={() =>
                setSection((current) =>
                  current === "create" ? "friends" : "create",
                )
              }
              style={styles.startButton}
            >
              <Ionicons
                name={section === "create" ? "close" : "add"}
                size={18}
                color={colors.onAccent}
              />
              <Text style={styles.startButtonText}>
                {section === "create" ? "Cancel" : "Start crew"}
              </Text>
            </Pressable>
          )}
        </View>

        {!!activeRoom && (
          <View style={styles.tabs}>
            <Pressable
              onPress={() => setSection("friends")}
              style={[styles.tab, section === "friends" && styles.tabActive]}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color={section === "friends" ? colors.onAccent : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  section === "friends" && styles.tabTextActive,
                ]}
              >
                Friends
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSection("walkie")}
              style={[styles.tab, section === "walkie" && styles.tabActive]}
            >
              <Ionicons
                name="mic-outline"
                size={18}
                color={section === "walkie" ? colors.onAccent : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  section === "walkie" && styles.tabTextActive,
                ]}
              >
                Walkie
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {section === "friends" ? (
          <FriendsScreen userId={userId} darkMode={darkMode} />
        ) : section === "create" && !activeRoom ? (
          <CreateCrewScreen
            userId={userId}
            darkMode={darkMode}
            onCreated={handleCrewCreated}
          />
        ) : activeRoom ? (
          <WalkieScreen
            userId={userId}
            darkMode={darkMode}
            onRoomChange={handleRoomChange}
          />
        ) : (
          <FriendsScreen userId={userId} darkMode={darkMode} />
        )}
      </View>
    </View>
  );
}

const LIGHT = {
  background: "#F1F3F5",
  surface: "#FFFFFF",
  line: "#D5DBE1",
  text: "#20262E",
  muted: "#687482",
  accent: "#456B8C",
  onAccent: "#FFFFFF",
};

const DARK = {
  background: "#0B0E12",
  surface: "#151B23",
  line: "#2B3542",
  text: "#E7ECF2",
  muted: "#9AA7B5",
  accent: "#314B63",
  onAccent: "#F3F6FA",
};

function createStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      gap: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.background,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    titleCopy: {
      flex: 1,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "900",
    },
    subtitle: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    startButton: {
      minHeight: 40,
      paddingHorizontal: 13,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: colors.accent,
    },
    startButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: "800",
    },
    tabs: {
      flexDirection: "row",
      padding: 4,
      gap: 4,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    tabActive: {
      backgroundColor: colors.accent,
    },
    tabText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800",
    },
    tabTextActive: {
      color: colors.onAccent,
    },
    body: {
      flex: 1,
      minHeight: 0,
    },
    loader: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.background,
    },
    loaderText: {
      color: colors.muted,
    },
  });
}
