const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const receiptSchema = {
  type: "OBJECT",
  properties: {
    date: {
      type: "STRING",
      description: "Receipt date as YYYY-MM-DD, or an empty string.",
    },
    liters: {
      type: "STRING",
      description: "Fuel quantity in litres using digits and decimal point only.",
    },
    amount: {
      type: "STRING",
      description: "Final amount paid in INR using digits and decimal point only.",
    },
    pricePerLiter: {
      type: "STRING",
      description: "Price per litre in INR using digits and decimal point only.",
    },
    station: {
      type: "STRING",
      description: "Fuel station, dealer, or company name.",
    },
  },
  required: ["date", "liters", "amount", "pricePerLiter", "station"],
};

const odometerSchema = {
  type: "OBJECT",
  properties: {
    odometer: {
      type: "STRING",
      description:
        "Total vehicle odometer in kilometres using digits only. Do not return trip meters, range, speed, time, or temperature.",
    },
  },
  required: ["odometer"],
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!request.headers.get("Authorization")) {
    return json({ error: "Sign in to use image detection." }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "Gemini is not configured." }, 500);
  }

  try {
    const { imageBase64, mimeType, kind } = await request.json();

    if (!["receipt", "odometer"].includes(kind)) {
      return json({ error: "Image kind must be receipt or odometer." }, 400);
    }
    if (
      typeof imageBase64 !== "string" ||
      imageBase64.length < 100 ||
      imageBase64.length > 14_000_000
    ) {
      return json({ error: "Choose a valid image under 10 MB." }, 400);
    }
    if (
      typeof mimeType !== "string" ||
      !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(
        mimeType,
      )
    ) {
      return json({ error: "Unsupported image format." }, 400);
    }

    const receiptPrompt = `
Read this Indian vehicle fuel receipt carefully.
Extract only values clearly supported by the image.
The final amount means the total actually paid, not subtotal or change.
Fuel quantity must be litres, and pricePerLiter must be the rate for one litre.
Return the date as YYYY-MM-DD.
Return an empty string for any uncertain or missing value.
Do not guess or invent values.
`;

    const odometerPrompt = `
Read the vehicle dashboard image carefully.
Extract the TOTAL odometer reading in kilometres.
Ignore speed, trip A/B, range, clock, temperature, fuel economy, and warning numbers.
Return digits only, without commas, spaces, decimals, or km.
If the total odometer is not clearly visible, return an empty string.
Do not guess.
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: kind === "receipt" ? receiptPrompt : odometerPrompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema:
              kind === "receipt" ? receiptSchema : odometerSchema,
          },
        }),
      },
    );

    const geminiBody = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const rateLimited = geminiResponse.status === 429;
      return json(
        {
          error: rateLimited
            ? "The free image-reading limit is busy. Please try again shortly."
            : geminiBody?.error?.message || "Image detection failed.",
        },
        rateLimited ? 429 : 502,
      );
    }

    const output = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!output) {
      return json({ error: "No readable values were found." }, 422);
    }

    const values = JSON.parse(output);
    return json({ kind, values });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not analyze this image.",
      },
      500,
    );
  }
});
