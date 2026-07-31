import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type MembershipRecord = {
  room_id: string;
  user_id: string;
  joined_at?: string;
};

type DatabaseWebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: MembershipRecord | null;
  old_record: MembershipRecord | null;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !vapidPublicKey ||
      !vapidPrivateKey ||
      !vapidSubject
    ) {
      throw new Error("Required server secrets are missing.");
    }

    const payload = await request.json() as DatabaseWebhookPayload;
    const membership = payload.record;

    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "walkie_room_members" ||
      !membership?.room_id ||
      !membership?.user_id
    ) {
      return new Response(
        JSON.stringify({ skipped: true }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: room, error: roomError } = await supabase
      .from("walkie_rooms")
      .select("id, name, created_by")
      .eq("id", membership.room_id)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }

    if (!room || room.created_by === membership.user_id) {
      return new Response(
        JSON.stringify({ skipped: true }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const [{ data: creator }, { data: subscriptions, error: subscriptionError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, username")
          .eq("id", room.created_by)
          .maybeSingle(),
        supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_key, expiration_time")
          .eq("user_id", membership.user_id),
      ]);

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscriptions?.length) {
      return new Response(
        JSON.stringify({ delivered: 0, reason: "No subscriptions" }),
        { status: 200, headers: jsonHeaders },
      );
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

    const creatorName =
      creator?.display_name?.trim() ||
      creator?.username?.trim() ||
      "A friend";

    const notification = JSON.stringify({
      title: `Added to ${room.name}`,
      body: `${creatorName} added you to a Motorly crew. Tap to open Walkie.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      tag: `motorly-crew-${room.id}`,
      roomId: room.id,
      url: "/?page=crew&section=walkie&fromPush=1",
    });

    let delivered = 0;
    const expiredSubscriptionIds: number[] = [];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expiration_time ?? null,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth_key,
              },
            },
            notification,
            {
              TTL: 300,
              urgency: "high",
            },
          );
          delivered += 1;
        } catch (pushError) {
          const statusCode =
            typeof pushError === "object" &&
            pushError !== null &&
            "statusCode" in pushError
              ? Number(pushError.statusCode)
              : 0;

          if (statusCode === 404 || statusCode === 410) {
            expiredSubscriptionIds.push(subscription.id);
            return;
          }

          console.error("Push delivery failed", pushError);
        }
      }),
    );

    if (expiredSubscriptionIds.length) {
      const { error: cleanupError } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredSubscriptionIds);

      if (cleanupError) {
        console.error("Expired subscription cleanup failed", cleanupError);
      }
    }

    return new Response(
      JSON.stringify({
        delivered,
        removed: expiredSubscriptionIds.length,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    console.error("send-crew-push failed", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
