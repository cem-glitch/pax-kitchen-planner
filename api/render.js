function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 503, {
      error: "PAX AI backend is not configured.",
    });
  }

  const {
    prompt,
    floorPlanBase64,
    referenceImages = [],
    quality = "medium",
  } = req.body || {};

  if (!prompt || !floorPlanBase64) {
    return json(res, 400, {
      error: "Missing prompt or floor plan.",
    });
  }

  const refs = Array.isArray(referenceImages)
    ? referenceImages
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.imageUrl
        )
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const content = [
    {
      type: "input_text",
      text: String(prompt),
    },
    {
      type: "input_image",
      image_url:
        "data:image/png;base64," +
        String(floorPlanBase64),
      detail: "high",
    },
    ...refs.map((imageUrl) => ({
      type: "input_image",
      image_url: imageUrl,
      detail: "high",
    })),
  ];

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
              quality:
                ["low", "medium", "high"].includes(
                  quality
                )
                  ? quality
                  : "medium",
              size: "1536x1024",
              output_format: "png",
            },
          ],
          tool_choice: {
            type: "image_generation",
          },
        }),
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      return json(res, response.status, {
        error:
          payload?.error?.message ||
          "OpenAI render request failed.",
      });
    }

    const imageCall = Array.isArray(payload?.output)
      ? payload.output.find(
          (item) =>
            item.type === "image_generation_call"
        )
      : null;

    if (!imageCall?.result) {
      return json(res, 502, {
        error:
          "OpenAI returned no generated image.",
      });
    }

    return json(res, 200, {
      imageBase64: imageCall.result,
      responseId: payload.id || null,
    });
  } catch (error) {
    return json(res, 500, {
      error:
        error?.message ||
        "Unexpected render backend error.",
    });
  }
}
