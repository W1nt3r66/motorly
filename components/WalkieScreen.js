import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const MAX_CREW_SIZE = 10;
const MAX_RECORDING_SECONDS = 15;
const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";
let sharedWalkiePlayer = null;
let sharedWebAudioEnabled = false;

export default function WalkieScreen({
  userId,
  darkMode = true,
  onRoomChange,
}) {
  const colors = darkMode ? DARK : LIGHT;
  const styles = createStyles(colors);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const playerRef = useRef(sharedWalkiePlayer);
  const activeRoomRef = useRef(null);
  const sendingRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const pressHeldRef = useRef(false);
  const pulseAnimation = useRef(new Animated.Value(0)).current;

  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [friends, setFriends] = useState([]);
  const [roomMemberIds, setRoomMemberIds] = useState([]);

  const [roomName, setRoomName] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState(null);
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(
    Platform.OS !== "web" || sharedWebAudioEnabled,
  );
  const [showSafety, setShowSafety] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    activeRoomRef.current = activeRoom;
    if (loading) return;
    onRoomChange?.(activeRoom);
  }, [activeRoom, loading, onRoomChange]);

  useEffect(() => {
    AsyncStorage.getItem(`motorly-drive-safety-seen-${userId}`)
      .then((value) => setShowSafety(value !== "1"))
      .catch(() => setShowSafety(true));
  }, [userId]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [pulseAnimation]);

  const showError = useCallback((message) => {
    setError(message || "Something went wrong.");
    setNotice("");
  }, []);

  const loadProfiles = useCallback(
    async (profileIds) => {
      const uniqueIds = [...new Set(profileIds.filter(Boolean))];

      if (!uniqueIds.length) {
        return {};
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", uniqueIds);

      if (profileError) {
        showError(profileError.message);
        return {};
      }

      const profileMap = Object.fromEntries(
        (data || []).map((profile) => [profile.id, profile]),
      );

      setProfiles((current) => ({
        ...current,
        ...profileMap,
      }));

      return profileMap;
    },
    [showError],
  );

  const loadFriends = useCallback(async () => {
    const { data, error: friendshipError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (friendshipError) {
      showError(friendshipError.message);
      return;
    }

    const friendIds = [
      ...new Set(
        (data || []).map((friendship) =>
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

    const profileMap = await loadProfiles(friendIds);

    setFriends(
      friendIds
        .map((id) => profileMap[id])
        .filter(Boolean)
        .sort((a, b) => getProfileName(a).localeCompare(getProfileName(b))),
    );
  }, [loadProfiles, showError, userId]);

  const loadRoomMembers = useCallback(
    async (roomId) => {
      if (!roomId) {
        setRoomMemberIds([]);
        return;
      }

      const { data, error: memberError } = await supabase
        .from("walkie_room_members")
        .select("user_id")
        .eq("room_id", roomId);

      if (memberError) {
        showError(memberError.message);
        return;
      }

      setRoomMemberIds((data || []).map((member) => member.user_id));
    },
    [showError],
  );

  const loadRooms = useCallback(async () => {
    setError("");

    const { data: memberships, error: membershipError } = await supabase
      .from("walkie_room_members")
      .select("room_id, user_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (membershipError) {
      showError(membershipError.message);
      setLoading(false);
      return;
    }

    const roomIds = (memberships || []).map((item) => item.room_id);

    if (!roomIds.length) {
      setRooms([]);
      setActiveRoom(null);
      setLoading(false);
      return;
    }

    const { data: roomData, error: roomError } = await supabase
      .from("walkie_rooms")
      .select("*")
      .in("id", roomIds)
      .order("updated_at", { ascending: false });

    if (roomError) {
      showError(roomError.message);
      setLoading(false);
      return;
    }

    const nextRooms = roomData || [];
    setRooms(nextRooms);

    setActiveRoom((current) => {
      if (current) {
        return (
          nextRooms.find((room) => room.id === current.id) ||
          nextRooms[0] ||
          null
        );
      }

      return nextRooms[0] || null;
    });

    setLoading(false);
  }, [showError, userId]);

  const loadMessages = useCallback(
    async (roomId) => {
      if (!roomId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);

      const { data, error: messageError } = await supabase
        .from("walkie_messages")
        .select("*")
        .eq("room_id", roomId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(30);

      if (messageError) {
        showError(messageError.message);
        setLoadingMessages(false);
        return;
      }

      const nextMessages = data || [];
      setMessages(nextMessages);
      await loadProfiles(nextMessages.map((message) => message.sender_id));
      setLoadingMessages(false);
    },
    [loadProfiles, showError],
  );

  useEffect(() => {
    Promise.all([loadRooms(), loadFriends()]).finally(() => setLoading(false));
  }, [loadFriends, loadRooms]);

  useEffect(() => {
    if (activeRoom?.id) {
      loadMessages(activeRoom.id);
      loadRoomMembers(activeRoom.id);
    } else {
      setMessages([]);
      setRoomMemberIds([]);
    }
  }, [activeRoom?.id, loadMessages, loadRoomMembers]);

  useEffect(() => {
    if (!activeRoom?.id) {
      return undefined;
    }

    const roomId = activeRoom.id;
    const channel = supabase
      .channel(`walkie-members-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walkie_room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadRoomMembers(roomId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoom?.id, loadRoomMembers]);

  const playMessage = useCallback(
    async (message, automatic = false) => {
      if (!message?.storage_path || (automatic && muted)) {
        return;
      }

      if (automatic && !audioEnabled) {
        return;
      }

      try {
        setError("");

        const { data, error: urlError } = await supabase.storage
          .from("walkie-audio")
          .createSignedUrl(message.storage_path, 60);

        if (urlError) {
          throw urlError;
        }

        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });

        let player = playerRef.current;

        if (!player) {
          player = createAudioPlayer(data.signedUrl, {
            downloadFirst: true,
          });
          playerRef.current = player;
          sharedWalkiePlayer = player;
        } else {
          player.replace(data.signedUrl);
        }

        player.volume = 1;
        player.play();

        if (message.sender_id !== userId) {
          await supabase.from("walkie_message_receipts").upsert(
            {
              message_id: message.id,
              user_id: userId,
              heard_at: new Date().toISOString(),
            },
            {
              onConflict: "message_id,user_id",
            },
          );
        }
      } catch (playError) {
        showError(playError.message);
      }
    },
    [audioEnabled, muted, showError, userId],
  );

  const enableCrewAudio = async () => {
    try {
      let player = playerRef.current;

      if (!player) {
        player = createAudioPlayer(SILENT_AUDIO);
        playerRef.current = player;
        sharedWalkiePlayer = player;
      } else {
        player.replace(SILENT_AUDIO);
      }

      player.volume = 0;
      player.play();
      sharedWebAudioEnabled = true;
      setAudioEnabled(true);

      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.volume = 1;
        }
      }, 100);

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch (audioError) {
      showError(
        audioError.message || "Audio could not be enabled on this device.",
      );
    }
  };

  useEffect(() => {
    if (!activeRoom?.id) {
      return undefined;
    }

    const roomId = activeRoom.id;

    const channel = supabase
      .channel(`walkie-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "walkie_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const incomingMessage = payload.new;

          setMessages((current) => [
            incomingMessage,
            ...current.filter((message) => message.id !== incomingMessage.id),
          ]);

          await loadProfiles([incomingMessage.sender_id]);

          if (
            incomingMessage.sender_id !== userId &&
            activeRoomRef.current?.id === roomId
          ) {
            await playMessage(incomingMessage, true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoom?.id, loadProfiles, playMessage, userId]);

  const toggleFriend = (friendId) => {
    setSelectedFriendIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((id) => id !== friendId);
      }

      if (current.length >= MAX_CREW_SIZE - 1) {
        showError("A Motorly crew can contain no more than 10 people.");
        return current;
      }

      setError("");
      return [...current, friendId];
    });
  };

  const createRoom = async () => {
    const cleanName = roomName.trim();

    if (!cleanName) {
      showError("Enter a crew name.");
      return;
    }

    setCreatingRoom(true);
    setError("");
    setNotice("");

    try {
      const { data: room, error: roomError } = await supabase
        .from("walkie_rooms")
        .insert({
          name: cleanName,
          created_by: userId,
        })
        .select()
        .single();

      if (roomError) {
        throw roomError;
      }

      if (selectedFriendIds.length) {
        const { error: inviteError } = await supabase
          .from("walkie_room_members")
          .insert(
            selectedFriendIds.map((friendId) => ({
              room_id: room.id,
              user_id: friendId,
            })),
          );

        if (inviteError) {
          throw inviteError;
        }
      }

      setRoomName("");
      setSelectedFriendIds([]);
      setNotice(`Crew “${room.name}” is ready.`);
      await loadRooms();
      setActiveRoom(room);
    } catch (createError) {
      showError(createError.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const addFriendToRoom = async (friend) => {
    if (!activeRoom || activeRoom.created_by !== userId) {
      return;
    }

    if (roomMemberIds.length >= MAX_CREW_SIZE) {
      showError("This crew already has the maximum of 10 members.");
      return;
    }

    setAddingMemberId(friend.id);
    setError("");

    try {
      const { error: addError } = await supabase
        .from("walkie_room_members")
        .insert({
          room_id: activeRoom.id,
          user_id: friend.id,
        });

      if (addError) {
        if (addError.code === "23505") {
          throw new Error(
            `${getProfileName(friend)} is already in an active crew.`,
          );
        }

        throw addError;
      }

      await loadRoomMembers(activeRoom.id);
    } catch (memberError) {
      showError(memberError.message);
    } finally {
      setAddingMemberId(null);
    }
  };

  const startTalking = async () => {
    if (!activeRoom || sendingRef.current || recorderState.isRecording) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        showError("Microphone permission is required for walkie-talkie.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record({
        forDuration: MAX_RECORDING_SECONDS,
      });
      recordingActiveRef.current = true;
    } catch (recordError) {
      recordingActiveRef.current = false;
      showError(recordError.message);
    }
  };

  const stopTalking = async () => {
    if (!recordingActiveRef.current || sendingRef.current) {
      return;
    }

    recordingActiveRef.current = false;
    sendingRef.current = true;
    setSending(true);

    try {
      const durationMs = Math.max(
        1,
        Math.min(
          recorderState.durationMillis || 1,
          MAX_RECORDING_SECONDS * 1000,
        ),
      );

      await recorder.stop();

      const uri = recorder.uri;

      if (!uri) {
        throw new Error("The recording file could not be found.");
      }

      const response = await fetch(uri);
      const audioData = await response.arrayBuffer();

      if (audioData.byteLength > 2000000) {
        throw new Error(
          "That recording is larger than 2 MB. Please send a shorter message.",
        );
      }

      const isWebRecording =
        uri.toLowerCase().includes(".webm") ||
        response.headers.get("content-type")?.includes("webm");

      const extension = isWebRecording ? "webm" : "m4a";
      const contentType = isWebRecording ? "audio/webm" : "audio/mp4";

      const storagePath =
        `${activeRoom.id}/${userId}/` +
        `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("walkie-audio")
        .upload(storagePath, audioData, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { error: messageError } = await supabase
        .from("walkie_messages")
        .insert({
          room_id: activeRoom.id,
          sender_id: userId,
          storage_path: storagePath,
          duration_ms: durationMs,
        });

      if (messageError) {
        await supabase.storage.from("walkie-audio").remove([storagePath]);

        throw messageError;
      }

      setNotice("");
      await loadMessages(activeRoom.id);
    } catch (sendError) {
      showError(sendError.message);
    } finally {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => {});

      sendingRef.current = false;
      setSending(false);
    }
  };

  const handlePressIn = async () => {
    pressHeldRef.current = true;
    await startTalking();

    if (!pressHeldRef.current) {
      await stopTalking();
    }
  };

  const handlePressOut = async () => {
    pressHeldRef.current = false;
    await stopTalking();
  };

  const dismissSafety = async () => {
    setShowSafety(false);
    await AsyncStorage.setItem(
      `motorly-drive-safety-seen-${userId}`,
      "1",
    ).catch(() => {});
  };

  const performCloseRoom = async () => {
    if (!activeRoom) {
      return;
    }

    const isCreator = activeRoom.created_by === userId;
    setError("");

    try {
      if (isCreator) {
        const { data: roomMessages, error: messageLoadError } = await supabase
          .from("walkie_messages")
          .select("storage_path")
          .eq("room_id", activeRoom.id);

        if (messageLoadError) {
          throw messageLoadError;
        }

        const paths = (roomMessages || [])
          .map((message) => message.storage_path)
          .filter(Boolean);

        if (paths.length) {
          const { error: storageError } = await supabase.storage
            .from("walkie-audio")
            .remove(paths);

          if (storageError) {
            throw storageError;
          }
        }

        const { error: roomDeleteError } = await supabase
          .from("walkie_rooms")
          .delete()
          .eq("id", activeRoom.id);

        if (roomDeleteError) {
          throw roomDeleteError;
        }
      } else {
        const { error: leaveError } = await supabase
          .from("walkie_room_members")
          .delete()
          .eq("room_id", activeRoom.id)
          .eq("user_id", userId);

        if (leaveError) {
          throw leaveError;
        }
      }

      setMessages([]);
      setRoomMemberIds([]);
      setRooms([]);
      setActiveRoom(null);
      setNotice("");
      if (playerRef.current) {
        try {
          playerRef.current.remove();
        } catch {
          // Player may already be released.
        }
      }
      playerRef.current = null;
      sharedWalkiePlayer = null;
      sharedWebAudioEnabled = false;
      setAudioEnabled(Platform.OS !== "web");
      onRoomChange?.(null);
    } catch (closeError) {
      showError(closeError.message);
    }
  };

  const closeCurrentRoom = () => {
    if (!activeRoom) {
      return;
    }

    const isCreator = activeRoom.created_by === userId;
    const title = isCreator ? "Close crew?" : "Leave crew?";
    const description = isCreator
      ? "The room, transmissions and membership data will be deleted."
      : "You will leave this crew and can join another one.";

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${title}\n\n${description}`);

      if (confirmed) {
        performCloseRoom();
      }

      return;
    }

    Alert.alert(title, description, [
      { text: "Cancel", style: "cancel" },
      {
        text: isCreator ? "Close crew" : "Leave crew",
        style: "destructive",
        onPress: performCloseRoom,
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.mutedText}>Loading your crews…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {showSafety && (
        <View style={styles.warning}>
          <Pressable
            onPress={dismissSafety}
            style={styles.warningClose}
            accessibilityLabel="Dismiss safety reminder"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.warningTitle}>Drive safely</Text>
          <Text style={styles.warningText}>
            Ask a passenger to operate Motorly whenever possible. Never interact
            with the phone when it is unsafe to do so.
          </Text>
        </View>
      )}

      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Crew walkie-talkie</Text>
          <Text style={styles.subtitle}>
            Private voice messages for crews of up to 10 friends.
          </Text>
        </View>

        <Pressable
          style={[styles.muteButton, muted && styles.muteButtonActive]}
          onPress={() => setMuted((current) => !current)}
        >
          <Text style={styles.muteButtonText}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
      </View>

      <View style={styles.feedbackSlot}>
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!error && !!notice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
      </View>

      {!activeRoom && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create a crew</Text>

          <TextInput
            value={roomName}
            onChangeText={setRoomName}
            placeholder="Crew name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={40}
          />

          <Text style={styles.sectionLabel}>
            Invite accepted friends ({selectedFriendIds.length}/9)
          </Text>

          {!friends.length ? (
            <Text style={styles.emptyText}>
              Add and accept friends before creating a shared crew.
            </Text>
          ) : (
            <View style={styles.friendList}>
              {friends.map((friend) => {
                const selected = selectedFriendIds.includes(friend.id);

                return (
                  <Pressable
                    key={friend.id}
                    onPress={() => toggleFriend(friend.id)}
                    style={[
                      styles.friendChip,
                      selected && styles.friendChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.friendChipText,
                        selected && styles.friendChipTextSelected,
                      ]}
                    >
                      {selected ? "✓ " : ""}
                      {getProfileName(friend)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={createRoom}
            disabled={creatingRoom}
            style={[
              styles.primaryButton,
              creatingRoom && styles.disabledButton,
            ]}
          >
            {creatingRoom ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>Create crew</Text>
            )}
          </Pressable>
        </View>
      )}

      {activeRoom && (
        <View style={styles.card}>
          <View style={styles.roomTitleRow}>
            <Text style={styles.cardTitle}>{activeRoom.name}</Text>
            <Pressable
              onPress={closeCurrentRoom}
              style={styles.closeRoomButton}
            >
              <Text style={styles.closeRoomButtonText}>
                {activeRoom.created_by === userId ? "Close crew" : "Leave crew"}
              </Text>
            </Pressable>
          </View>
          {Platform.OS === "web" && !audioEnabled && (
            <View style={styles.audioEnableCard}>
              <View style={styles.audioEnableCopy}>
                <Text style={styles.audioEnableTitle}>
                  Enable automatic crew audio
                </Text>
                <Text style={styles.audioEnableText}>
                  Required once after opening Motorly on iPhone.
                </Text>
              </View>
              <Pressable
                onPress={enableCrewAudio}
                style={styles.audioEnableButton}
              >
                <Text style={styles.audioEnableButtonText}>Enable audio</Text>
              </Pressable>
            </View>
          )}
          {activeRoom.created_by === userId && (
            <View style={styles.memberManager}>
              <Text style={styles.sectionLabel}>
                Crew members ({roomMemberIds.length}/{MAX_CREW_SIZE})
              </Text>
              <Text style={styles.memberManagerText}>
                Add accepted friends to this drive. Only crew members receive
                Walkie access.
              </Text>

              {friends.filter((friend) => !roomMemberIds.includes(friend.id))
                .length && roomMemberIds.length < MAX_CREW_SIZE ? (
                <View style={styles.friendList}>
                  {friends
                    .filter((friend) => !roomMemberIds.includes(friend.id))
                    .map((friend) => (
                      <Pressable
                        key={friend.id}
                        onPress={() => addFriendToRoom(friend)}
                        disabled={addingMemberId === friend.id}
                        style={styles.addMemberChip}
                      >
                        {addingMemberId === friend.id ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.buttonText}
                          />
                        ) : (
                          <Text style={styles.addMemberChipText}>
                            + {getProfileName(friend)}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  {roomMemberIds.length >= MAX_CREW_SIZE
                    ? "This crew is full."
                    : "All available friends are already in this crew."}
                </Text>
              )}
            </View>
          )}
          <Text style={styles.roomHint}>
            Hold the button while speaking. Maximum message length: 15 seconds.
          </Text>

          <View style={styles.talkButtonWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.talkPulse,
                {
                  opacity: pulseAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.55, 0.12],
                  }),
                  transform: [
                    {
                      scale: pulseAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.16],
                      }),
                    },
                  ],
                },
              ]}
            />

            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onLongPress={() => {}}
              delayLongPress={MAX_RECORDING_SECONDS * 1000}
              disabled={sending}
              style={[
                styles.talkButton,
                recorderState.isRecording && styles.talkButtonRecording,
                sending && styles.disabledButton,
              ]}
            >
              <Text selectable={false} style={styles.talkIcon}>
                {recorderState.isRecording ? "●" : "🎙"}
              </Text>

              <Text selectable={false} style={styles.talkButtonText}>
                {sending
                  ? "Sending…"
                  : recorderState.isRecording
                    ? `Talking ${Math.ceil(
                        (recorderState.durationMillis || 0) / 1000,
                      )}s`
                    : "Hold to talk"}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.releaseHint}>
            Release the button to send your message.
          </Text>

          <View style={styles.messageHeader}>
            <Text style={styles.sectionLabel}>Recent transmissions</Text>

            <Pressable onPress={() => loadMessages(activeRoom.id)}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>

          {loadingMessages ? (
            <ActivityIndicator color={colors.accent} />
          ) : !messages.length ? (
            <Text style={styles.emptyText}>
              No transmissions yet. Be the first to speak.
            </Text>
          ) : (
            messages.map((message) => {
              const sender = profiles[message.sender_id];
              const isMine = message.sender_id === userId;

              return (
                <Pressable
                  key={message.id}
                  onPress={() => playMessage(message)}
                  style={styles.messageRow}
                >
                  <View style={styles.playCircle}>
                    <Text style={styles.playText}>▶</Text>
                  </View>

                  <View style={styles.messageDetails}>
                    <Text style={styles.senderName}>
                      {isMine
                        ? "You"
                        : sender
                          ? getProfileName(sender)
                          : "Crew member"}
                    </Text>

                    <Text style={styles.messageMeta}>
                      {formatDuration(message.duration_ms)} ·{" "}
                      {formatTime(message.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.listenText}>Listen</Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

function getProfileName(profile) {
  return profile?.display_name || profile?.username || "Motorly friend";
}

function formatDuration(durationMs) {
  return `${Math.max(1, Math.ceil((durationMs || 0) / 1000))} sec`;
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DARK = {
  background: "#0B0E12",
  surface: "#151B23",
  surfaceRaised: "#1B2430",
  border: "#2B3542",
  text: "#E7ECF2",
  muted: "#9AA7B5",
  accent: "#8FAFD0",
  accentDark: "#314B63",
  buttonText: "#F8FAFC",
  danger: "#E26D67",
  dangerSurface: "#351E21",
  success: "#9CC9AE",
  successSurface: "#183025",
  warning: "#E8C87C",
  warningSurface: "#302817",
};

const LIGHT = {
  background: "#F1F3F5",
  surface: "#FFFFFF",
  surfaceRaised: "#E9EEF3",
  border: "#D5DBE1",
  text: "#20262E",
  muted: "#687482",
  accent: "#456B8C",
  accentDark: "#456B8C",
  buttonText: "#FFFFFF",
  danger: "#B44646",
  dangerSurface: "#FBEAEA",
  success: "#2F7450",
  successSurface: "#E6F5EC",
  warning: "#805F17",
  warningSurface: "#FFF5D9",
};

function createStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 18,
      paddingBottom: 80,
      gap: 16,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      backgroundColor: colors.background,
    },
    mutedText: {
      color: colors.muted,
    },
    warning: {
      position: "relative",
      padding: 14,
      paddingRight: 58,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 16,
      backgroundColor: colors.warningSurface,
    },
    warningClose: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceRaised,
      zIndex: 2,
    },
    warningCloseText: {
      color: colors.text,
      fontSize: 22,
      lineHeight: 24,
      fontWeight: "700",
    },
    warningTitle: {
      color: colors.warning,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: 4,
    },
    warningText: {
      color: colors.text,
      lineHeight: 20,
    },
    headingRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
    },
    feedbackSlot: {
      minHeight: 52,
      justifyContent: "center",
    },
    headingCopy: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 220,
    },
    title: {
      color: colors.text,
      fontSize: 27,
      fontWeight: "900",
    },
    subtitle: {
      color: colors.muted,
      marginTop: 5,
      lineHeight: 20,
      maxWidth: 470,
    },
    muteButton: {
      flexShrink: 0,
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    muteButtonActive: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSurface,
    },
    muteButtonText: {
      color: colors.text,
      fontWeight: "800",
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 16,
      gap: 14,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "900",
    },
    roomTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    closeRoomButton: {
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSurface,
    },
    closeRoomButtonText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "800",
    },
    audioEnableCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.surfaceRaised,
    },
    audioEnableCopy: {
      flex: 1,
    },
    audioEnableTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "900",
    },
    audioEnableText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
    audioEnableButton: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentDark,
    },
    audioEnableButtonText: {
      color: colors.buttonText,
      fontSize: 12,
      fontWeight: "800",
    },
    memberManager: {
      padding: 13,
      gap: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
    },
    memberManagerText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    addMemberChip: {
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentDark,
    },
    addMemberChipText: {
      color: colors.buttonText,
      fontSize: 12,
      fontWeight: "800",
    },
    sectionLabel: {
      color: colors.text,
      fontWeight: "800",
    },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 15,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      fontSize: 16,
    },
    friendList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    friendChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 9,
      backgroundColor: colors.surfaceRaised,
    },
    friendChipSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accentDark,
    },
    friendChipText: {
      color: colors.text,
      fontWeight: "700",
    },
    friendChipTextSelected: {
      color: colors.buttonText,
    },
    primaryButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.accentDark,
    },
    primaryButtonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: "900",
    },
    disabledButton: {
      opacity: 0.55,
    },
    roomTabs: {
      gap: 9,
    },
    roomTab: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 13,
      paddingHorizontal: 15,
      paddingVertical: 11,
      backgroundColor: colors.surfaceRaised,
    },
    roomTabSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accentDark,
    },
    roomTabText: {
      color: colors.text,
      fontWeight: "800",
    },
    roomTabTextSelected: {
      color: colors.buttonText,
    },
    roomHint: {
      color: colors.muted,
      lineHeight: 20,
    },
    talkButtonWrap: {
      width: 220,
      height: 220,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
    },
    talkButton: {
      minHeight: 190,
      borderRadius: 95,
      alignSelf: "center",
      width: 190,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#C43F46",
      borderWidth: 5,
      borderColor: "#FF8B91",
      zIndex: 2,
      userSelect: "none",
      touchAction: "none",
    },
    talkButtonRecording: {
      backgroundColor: "#E5484D",
      borderColor: "#FFD0D2",
    },
    talkPulse: {
      position: "absolute",
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: "#E5484D",
      zIndex: 1,
    },
    talkIcon: {
      color: colors.buttonText,
      fontSize: 34,
      marginBottom: 8,
      userSelect: "none",
    },
    talkButtonText: {
      color: colors.buttonText,
      fontSize: 18,
      fontWeight: "900",
      userSelect: "none",
    },
    releaseHint: {
      color: colors.muted,
      textAlign: "center",
    },
    messageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8,
    },
    refreshText: {
      color: colors.accent,
      fontWeight: "800",
    },
    messageRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    playCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentDark,
    },
    playText: {
      color: colors.buttonText,
      marginLeft: 2,
    },
    messageDetails: {
      flex: 1,
    },
    senderName: {
      color: colors.text,
      fontWeight: "800",
    },
    messageMeta: {
      color: colors.muted,
      marginTop: 3,
      fontSize: 13,
    },
    listenText: {
      color: colors.accent,
      fontWeight: "800",
    },
    emptyText: {
      color: colors.muted,
      lineHeight: 20,
    },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 13,
      padding: 12,
    },
    errorText: {
      color: colors.danger,
      fontWeight: "700",
    },
    noticeBox: {
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.successSurface,
      borderRadius: 13,
      padding: 12,
    },
    noticeText: {
      color: colors.success,
      fontWeight: "700",
    },
  });
}
