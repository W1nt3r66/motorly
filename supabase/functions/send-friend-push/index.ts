import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type FriendshipRecord = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at?: string;
  updated_at?: string;
};

type DatabaseWebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: FriendshipRecord | null;
  old_record: FriendshipRecord | null;
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

    if (
      payload.schema !== "public" ||
      payload.table !== "friendships" ||
      !payload.record
    ) {
      return new Response(
        JSON.stringify({ skipped: true }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const friendship = payload.record;
    let recipientId = "";
    let actorId = "";
    let title = "";
    let messageTemplate = "";

    if (payload.type === "INSERT" && friendship.status === "pending") {
      recipientId = friendship.addressee_id;
      actorId = friendship.requester_id;
      title = "New Motorly friend request";
      messageTemplate = "sent you a friend request.";
    } else if (
      payload.type === "UPDATE" &&
      payload.old_record?.status === "pending" &&
      friendship.status === "accepted"
    ) {
      recipientId = friendship.requester_id;
      actorId = friendship.addressee_id;
      title = "Friend request accepted";
      messageTemplate = "accepted your Motorly friend request.";
    } else {
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

    const [{ data: actor }, { data: subscriptions, error: subscriptionError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, username")
          .eq("id", actorId)
          .maybeSingle(),
        supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_key, expiration_time")
          .eq("user_id", recipientId),
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

    const actorName =
      actor?.display_name?.trim() ||
      actor?.username?.trim() ||
      "A Motorly user";

    const notification = JSON.stringify({
      title,
      body: `${actorName} ${messageTemplate}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      tag: `motorly-friend-${friendship.id}-${friendship.status}`,
      url: "/?page=crew&section=friends&fromPush=1",
    });

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

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

          console.error("Friend push delivery failed", pushError);
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
    console.error("send-friend-push failed", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
