import { supabase } from "./supabase";

const TABLE = "user_garages";

export async function loadGarageFromCloud(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("garage_data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function saveGarageToCloud(userId, garageData) {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      garage_data: garageData,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) throw error;
}

export function subscribeToGarage(userId, onGarageChange) {
  const channel = supabase
    .channel(`motorly-garage-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new?.garage_data) {
          onGarageChange(payload.new.garage_data);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
