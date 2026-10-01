const RESPONSES_URL = "https://api.openai.com/v1/responses";

function friendlyError(status, payload) {
  const apiMessage =
    payload?.error?.message ||
    payload?.message ||
    "";

  if (status === 401) {
    return "API-nyckeln godkändes inte. Kontrollera nyckeln och försök igen.";
  }

  if (status === 429) {
    return "AI-tjänstens gräns eller saldo är nått. Kontrollera API-kontot och försök igen.";
  }

  if (status === 400 && apiMessage) {
    return "Renderförfrågan kunde inte behandlas: " + apiMessage;
  }

  return apiMessage || "AI-renderingen misslyckades (HTTP " + status + ").";
}

export async function generateKitchenRender({
  apiKey,
  prompt,
  floorPlanBase64,
  referenceImages,
  quality = "medium",
}) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new Error("Ange en OpenAI API-nyckel för testläget.");
  }

  const content = [
    { type: "input_text", text: prompt },
    {
      type: "input_image",
      image_url: "data:image/png;base64," + floorPlanBase64,
      detail: "high",
    },
    ...referenceImages.map((item) => ({
      type: "input_image",
      image_url: item.imageUrl,
      detail: "high",
    })),
  ];

  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-astra",
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
        },
      ],
    }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(friendlyError(response.status, payload));
  }

  const imageCall = Array.isArray(payload?.output)
    ? payload.output.find((item) => item.type === "image_generation_call")
    : null;

  if (!imageCall?.result) {
    const outputText = Array.isArray(payload?.output)
      ? payload.output
          .flatMap((item) => item.content || [])
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n")
      : "";

    throw new Error(
      outputText ||
        "AI-tjänsten svarade men returnerade ingen renderbild."
    );
  }

  return {
    imageBase64: imageCall.result,
    imageUri: "data:image/png;base64," + imageCall.result,
    responseId: payload.id || null,
  };
}
