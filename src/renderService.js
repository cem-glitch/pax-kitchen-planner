const RESPONSES_URL = "https://api.openai.com/v1/responses";

export const PAX_RENDER_API =
  typeof process !== "undefined" &&
  process.env &&
  process.env.EXPO_PUBLIC_PAX_RENDER_API
    ? process.env.EXPO_PUBLIC_PAX_RENDER_API
    : "";

export function hasPaxRenderBackend() {
  return !!PAX_RENDER_API;
}

function friendlyError(status, payload) {
  const apiMessage =
    payload?.error?.message ||
    payload?.error ||
    payload?.message ||
    "";

  if (status === 401) {
    return "AI-anslutningen godkändes inte.";
  }

  if (status === 429) {
    return "AI-tjänstens gräns eller saldo är nått. Försök igen senare.";
  }

  if (status === 503) {
    return "PAX AI-servern är inte färdigkonfigurerad ännu.";
  }

  if (status === 400 && apiMessage) {
    return "Renderförfrågan kunde inte behandlas: " + apiMessage;
  }

  return apiMessage || "AI-renderingen misslyckades (HTTP " + status + ").";
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      friendlyError(response.status, payload)
    );
  }

  return payload;
}

async function renderThroughPaxBackend({
  prompt,
  floorPlanBase64,
  referenceImages,
  quality,
}) {
  const payload = await postJson(
    PAX_RENDER_API,
    {
      prompt,
      floorPlanBase64,
      referenceImages,
      quality,
    }
  );

  const imageBase64 = payload?.imageBase64;
  const imageUrl = payload?.imageUrl;

  if (!imageBase64 && !imageUrl) {
    throw new Error(
      "PAX AI-servern svarade men returnerade ingen renderbild."
    );
  }

  return {
    imageBase64: imageBase64 || null,
    imageUri: imageBase64
      ? "data:image/png;base64," + imageBase64
      : imageUrl,
    responseId: payload?.responseId || null,
    source: "pax-backend",
  };
}

async function renderDirectForTesting({
  apiKey,
  prompt,
  floorPlanBase64,
  referenceImages,
  quality,
}) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new Error(
      "PAX AI-servern är inte aktiverad ännu. Använd avancerat testläge tills servern är ansluten."
    );
  }

  const content = [
    { type: "input_text", text: prompt },
    {
      type: "input_image",
      image_url:
        "data:image/png;base64," +
        floorPlanBase64,
      detail: "high",
    },
    ...referenceImages.map((item) => ({
      type: "input_image",
      image_url: item.imageUrl,
      detail: "high",
    })),
  ];

  const payload = await postJson(
    RESPONSES_URL,
    {
      model: "gpt-6-sol",
      input: [
        {
          role: "user",
          content,
        },
      ],
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-2.5-sunburst",
          quality,
          size: "1536x1024",
          output_format: "png",
        },
      ],
      tool_choice: {
        type: "image_generation",
      },
    },
    {
      Authorization: "Bearer " + key,
    }
  );

  const imageCall = Array.isArray(payload?.output)
    ? payload.output.find(
        (item) =>
          item.type ===
          "image_generation_call"
      )
    : null;

  if (!imageCall?.result) {
    throw new Error(
      "AI-tjänsten svarade men returnerade ingen renderbild."
    );
  }

  return {
    imageBase64: imageCall.result,
    imageUri:
      "data:image/png;base64," +
      imageCall.result,
    responseId: payload.id || null,
    source: "direct-test",
  };
}

export async function generateKitchenRender({
  apiKey,
  prompt,
  floorPlanBase64,
  referenceImages,
  quality = "medium",
}) {
  if (hasPaxRenderBackend()) {
    return renderThroughPaxBackend({
      prompt,
      floorPlanBase64,
      referenceImages,
      quality,
    });
  }

  return renderDirectForTesting({
    apiKey,
    prompt,
    floorPlanBase64,
    referenceImages,
    quality,
  });
}
