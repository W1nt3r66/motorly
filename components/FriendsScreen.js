import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const LIGHT = {
  ink: "#20262E",
  muted: "#687482",
  green: "#456B8C",
  accentSurface: "#446A8B",
  mint: "#DCE6EE",
  lime: "#A9C1D5",
  cream: "#F1F3F5",
  white: "#FFFFFF",
  onAccent: "#FEFFFF",
  line: "#D5DBE1",
  red: "#C45E5E",
};
const DARK = {
  ink: "#E7ECF2",
  muted: "#9AA7B5",
  green: "#8FAFD0",
  accentSurface: "#314B63",
  mint: "#202B38",
  lime: "#A8C2D8",
  cream: "#0B0E12",
  white: "#151B23",
  onAccent: "#F3F6FA",
  line: "#2B3542",
  red: "#E07A6B",
};
let friendNightMode = false;
const colors = new Proxy(LIGHT, {
  get(target, property) {
    return (friendNightMode ? DARK : target)[property];
  },
});

export default function FriendsScreen({ userId, darkMode }) {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  friendNightMode = darkMode;
  styles = darkMode ? darkStyles : lightStyles;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [relations, setRelations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFriends = useCallback(async () => {
    setError("");

    const { data, error: relationError } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (relationError) {
      setError(relationError.message);
      setLoading(false);
      return;
    }

    const nextRelations = data || [];
    const profileIds = [
      ...new Set(
        nextRelations.map((item) =>
          item.requester_id === userId ? item.addressee_id : item.requester_id,
        ),
      ),
    ];

    let profileMap = {};

    if (profileIds.length) {
      const { data: friendProfiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", profileIds);

      if (profileError) {
        setError(profileError.message);
      } else {
        profileMap = Object.fromEntries(
          (friendProfiles || []).map((profile) => [profile.id, profile]),
        );
      }
    }

    setRelations(nextRelations);
    setProfiles(profileMap);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    const refresh = () => loadFriends();
    const channel = supabase
      .channel(`motorly-friendships-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `requester_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "friendships",
          filter: `requester_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFriends, userId]);

  const relationshipFor = useCallback(
    (profileId) =>
      relations.find(
        (item) =>
          item.requester_id === profileId || item.addressee_id === profileId,
      ),
    [relations],
  );

  const search = async () => {
    const cleanQuery = query.trim().toLowerCase().replace(/^@/, "");
    setMessage("");
    setError("");

    if (cleanQuery.length < 3) {
      setError("Enter at least 3 characters.");
      return;
    }

    setSearching(true);
    const { data, error: searchError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `%${cleanQuery}%`)
      .neq("id", userId)
      .limit(10);
    setSearching(false);

    if (searchError) {
      setError(searchError.message);
      return;
    }

    setResults(data || []);
    if (!data?.length) setMessage("No Motorly users found.");
  };

  const sendRequest = async (profile) => {
    setError("");
    setMessage("");

    const { error: requestError } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: profile.id,
      status: "pending",
    });

    if (requestError) {
      setError(
        requestError.code === "23505"
          ? "A friendship or request already exists with this user."
          : requestError.message,
      );
      return;
    }

    setMessage(`Friend request sent to @${profile.username}.`);
    await loadFriends();
  };

  const answerRequest = async (id, status) => {
    setError("");
    const request =
      status === "declined"
        ? supabase.from("friendships").delete().eq("id", id)
        : supabase.from("friendships").update({ status }).eq("id", id);
    const { error: answerError } = await request;

    if (answerError) {
      setError(answerError.message);
      return;
    }

    await loadFriends();
  };

  const removeFriendship = async (id) => {
    setError("");
    const { error: removeError } = await supabase
      .from("friendships")
      .delete()
      .eq("id", id);

    if (removeError) {
      setError(removeError.message);
      return;
    }

    await loadFriends();
  };

  const incoming = useMemo(
    () =>
      relations.filter(
        (item) => item.status === "pending" && item.addressee_id === userId,
      ),
    [relations, userId],
  );

  const outgoing = useMemo(
    () =>
      relations.filter(
        (item) => item.status === "pending" && item.requester_id === userId,
      ),
    [relations, userId],
  );

  const accepted = useMemo(
    () => relations.filter((item) => item.status === "accepted"),
    [relations],
  );

  const otherProfile = (item) =>
    profiles[
      item.requester_id === userId ? item.addressee_id : item.requester_id
    ];

  return (
    <ScrollView
      contentContainerStyle={[styles.content, compact && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>MOTORLY FRIENDS</Text>
        <Text style={[styles.title, compact && styles.titleMobile]}>
          Drive better, together.
        </Text>
        <Text style={styles.subtitle}>
          Find friends by username, compare vehicles, and invite them to a
          convoy.
        </Text>
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.searchTitle}>Find a friend</Text>
        <Text style={styles.searchSubtitle}>
          Search using their unique Motorly username.
        </Text>
        <View style={[styles.searchRow, compact && styles.searchRowMobile]}>
          <View
            style={[
              styles.searchInputWrap,
              compact && styles.searchInputWrapMobile,
            ]}
          >
            <Ionicons name="at" size={20} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username"
              placeholderTextColor="#95A09A"
            />
          </View>
          <ActionButton
            title="Search"
            icon="search"
            onPress={search}
            busy={searching}
            secondary={compact}
            style={compact && styles.searchButtonMobile}
          />
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.message}>{message}</Text>}

        {results.map((profile) => {
          const relationship = relationshipFor(profile.id);
          const label =
            relationship?.status === "accepted"
              ? "Friends"
              : relationship?.status === "pending"
                ? relationship.addressee_id === userId
                  ? "Respond below"
                  : "Request sent"
                : "Add friend";

          return (
            <PersonRow
              key={profile.id}
              profile={profile}
              action={
                <ActionButton
                  title={label}
                  icon={relationship ? "checkmark" : "person-add"}
                  disabled={!!relationship}
                  onPress={() => sendRequest(profile)}
                  secondary={!!relationship}
                />
              }
            />
          );
        })}
      </View>

      {!!incoming.length && (
        <Section
          title="Friend requests"
          subtitle={`${incoming.length} waiting for your response`}
        >
          {incoming.map((item) => (
            <PersonRow
              key={item.id}
              profile={otherProfile(item)}
              action={
                <View style={styles.actions}>
                  <ActionButton
                    title="Decline"
                    secondary
                    onPress={() => answerRequest(item.id, "declined")}
                  />
                  <ActionButton
                    title="Accept"
                    icon="checkmark"
                    onPress={() => answerRequest(item.id, "accepted")}
                  />
                </View>
              }
            />
          ))}
        </Section>
      )}

      <Section
        title="Your friends"
        subtitle="People who can compare trips and join your convoys"
      >
        {!accepted.length && (
          <EmptyState
            icon="people-outline"
            title="Your crew starts here"
            text="Search for a username and send your first friend request."
          />
        )}
        {accepted.map((item) => (
          <PersonRow
            key={item.id}
            profile={otherProfile(item)}
            action={
              <ActionButton
                title="Remove"
                secondary
                onPress={() => removeFriendship(item.id)}
              />
            }
          />
        ))}
      </Section>

      {!!outgoing.length && (
        <Section title="Sent requests" subtitle="Waiting for your friends">
          {outgoing.map((item) => (
            <PersonRow
              key={item.id}
              profile={otherProfile(item)}
              action={
                <ActionButton
                  title="Cancel"
                  secondary
                  onPress={() => removeFriendship(item.id)}
                />
              }
            />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function PersonRow({ profile, action }) {
  if (!profile) return null;
  const initials = (profile.display_name || profile.username)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.personRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.personInfo}>
        <Text style={styles.personName}>
          {profile.display_name || profile.username}
        </Text>
        <Text style={styles.username}>@{profile.username}</Text>
      </View>
      {action}
    </View>
  );
}

function ActionButton({
  title,
  icon,
  onPress,
  secondary,
  disabled,
  busy,
  style,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        (disabled || busy) && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.green : colors.onAccent} />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={17}
              color={secondary ? colors.green : colors.onAccent}
            />
          )}
          <Text
            style={[styles.buttonText, secondary && styles.buttonTextSecondary]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.green} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.muted}>{text}</Text>
      </View>
    </View>
  );
}

const styleDefinitions = {
  content: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 110,
    gap: 20,
    maxWidth: 1180,
    width: "100%",
    alignSelf: "center",
  },
  contentMobile: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  intro: {
    paddingVertical: 12,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 8,
  },
  titleMobile: { fontSize: 28, lineHeight: 33 },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 600,
  },
  searchCard: {
    backgroundColor: colors.accentSurface,
    borderRadius: 22,
    padding: 24,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 22,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  searchTitle: {
    color: colors.onAccent,
    fontSize: 20,
    fontWeight: "900",
  },
  searchSubtitle: {
    color: "#C8D8D1",
    fontSize: 13,
    marginTop: 5,
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  searchRowMobile: { flexDirection: "column" },
  searchInputWrap: {
    flex: 1,
    minWidth: 170,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  searchInputWrapMobile: {
    flex: 0,
    width: "100%",
    minHeight: 50,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    outlineStyle: "none",
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
  },
  sectionBody: {
    marginTop: 13,
  },
  personRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.green,
    fontWeight: "900",
  },
  personInfo: {
    flex: 1,
    minWidth: 130,
  },
  personName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  username: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 11,
    backgroundColor: colors.accentSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  buttonSecondary: {
    backgroundColor: colors.mint,
  },
  searchButtonMobile: {
    width: "100%",
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: "800",
  },
  buttonTextSecondary: {
    color: colors.green,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 16,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 15,
    marginBottom: 4,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    color: "#FFD7D2",
    marginTop: 12,
  },
  message: {
    color: colors.lime,
    marginTop: 12,
  },
};

const darkColorMap = {
  ...Object.fromEntries(
    Object.keys(LIGHT).map((key) => [LIGHT[key], DARK[key]]),
  ),
  "#C8D8D1": "#AFBBC7",
  "#95A09A": "#8895A2",
  "#FFD7D2": "#F0A9A0",
};

function mapDarkStyles(value) {
  if (Array.isArray(value)) return value.map(mapDarkStyles);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapDarkStyles(child)]),
    );
  }
  return typeof value === "string" && darkColorMap[value]
    ? darkColorMap[value]
    : value;
}

const lightStyles = StyleSheet.create(styleDefinitions);
const darkStyles = StyleSheet.create(mapDarkStyles(styleDefinitions));
let styles = lightStyles;
