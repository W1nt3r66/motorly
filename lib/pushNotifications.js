import { Platform } from "react-native";
import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);

  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function supportsWebPush() {
  return Boolean(
    Platform.OS === "web" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  );
}

export function isInstalledWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }

  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true,
  );
}

export function getNotificationPermission() {
  if (!supportsWebPush()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export async function registerMotorlyServiceWorker() {
  if (!supportsWebPush()) {
    throw new Error("Push notifications are not supported on this device.");
  }

  await navigator.serviceWorker.register("/motorly-sw.js", {
    scope: "/",
  });

  return navigator.serviceWorker.ready;
}

export async function enableCrewPushNotifications(userId) {
  if (!userId) {
    throw new Error("Sign in before enabling notifications.");
  }

  if (!supportsWebPush()) {
    throw new Error(
      "This browser does not support Motorly push notifications.",
    );
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Motorly's notification public key is missing.");
  }

  if (!isInstalledWebApp()) {
    throw new Error(
      "On iPhone, add Motorly to the Home Screen before enabling notifications.",
    );
  }

  const permission = await window.Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked. Enable Motorly in your device notification settings."
        : "Notification permission was not granted.",
    );
  }

  const registration = await registerMotorlyServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const authKey = serialized.keys?.auth;

  if (!serialized.endpoint || !p256dh || !authKey) {
    throw new Error("The device returned an incomplete push subscription.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: serialized.endpoint,
      p256dh,
      auth_key: authKey,
      expiration_time: serialized.expirationTime ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw error;
  }

  return subscription;
}
