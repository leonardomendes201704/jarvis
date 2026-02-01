const path = require("path");
const express = require("express");

require("dotenv").config();

const fetchImpl = global.fetch || require("node-fetch");

const app = express();
const sessions = new Map();

function makeSessionId() {
  return "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getSession(sessionId) {
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function createSession() {
  const id = makeSessionId();
  const data = { id, history: [] };
  sessions.set(id, data);
  return data;
}

function trimHistory(history, maxMessages) {
  if (history.length <= maxMessages) return history;
  return history.slice(history.length - maxMessages);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
  }

  const text = (req.body && req.body.text ? String(req.body.text) : "").trim();
  const sessionId = req.body && req.body.sessionId ? String(req.body.sessionId) : "";
  if (!text) {
    return res.status(400).json({ error: "Texto vazio." });
  }

  let session = getSession(sessionId);
  if (!session) {
    session = createSession();
  }

  const systemMessage = {
    role: "system",
    content: [
      {
        type: "input_text",
        text:
          "Você é o Jarvis. Responda em português brasileiro com tom humano e direto, " +
          "como fala natural. Seja o mais curto possível sem perder a essência. " +
          "Prefira 1 frase (no máximo 2). Evite siglas, abreviações, parênteses e termos técnicos. " +
          "Use palavras completas (ex.: 'São Paulo' em vez de 'SP') e números por extenso quando couber. " +
          "Se precisar de mais informações, faça uma única pergunta curta.",
      },
    ],
  };

  const history = trimHistory(session.history, 12);
  const input = [
    systemMessage,
    ...history,
    { role: "user", content: [{ type: "input_text", text }] },
  ];

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1",
        temperature: 0.6,
        max_output_tokens: 140,
        input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const outputText = extractOutputText(data);

    session.history = trimHistory(
      [
        ...history,
        { role: "user", content: [{ type: "input_text", text }] },
        { role: "assistant", content: [{ type: "output_text", text: outputText || "" }] },
      ],
      12
    );

    return res.json({ text: outputText || "", sessionId: session.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao chamar OpenAI." });
  }
});

app.post("/api/parse-route", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
  }

  const text = (req.body && req.body.text ? String(req.body.text) : "").trim();
  if (!text) {
    return res.status(400).json({ error: "Texto vazio." });
  }

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Extraia origem e destino de um comando de rota em pt-BR. " +
                  "Use nomes completos e adiciona cidade/estado se mencionado. " +
                  "Remova artigos ('o', 'a', 'os', 'as') e termos redundantes. " +
                  "Retorne apenas JSON conforme o schema.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "route_parse",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                origin: { type: "string" },
                destination: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                country: { type: "string" },
              },
              required: ["origin", "destination", "city", "state", "country"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI parse error:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const outputText = extractOutputText(data);
    let parsed = null;
    try {
      parsed = outputText ? JSON.parse(outputText) : null;
    } catch (e) {}
    if (!parsed || !parsed.origin || !parsed.destination) {
      return res.status(422).json({ error: "Não consegui interpretar a rota." });
    }
    return res.json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao chamar OpenAI." });
  }
});

app.get("/api/route", async (req, res) => {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ORS_API_KEY não configurada." });
  }

  const start = (req.query && req.query.start ? String(req.query.start) : "").trim();
  const end = (req.query && req.query.end ? String(req.query.end) : "").trim();
  if (!start || !end) {
    return res.status(400).json({ error: "Origem/destino inválidos." });
  }

  try {
    const [startCoord, endCoord] = await Promise.all([
      geocodePlace(start),
      geocodePlace(end),
    ]);

    if (!startCoord || !endCoord) {
      return res.status(404).json({ error: "Não consegui localizar origem ou destino." });
    }

    console.log("ORS coords:", {
      start: { lat: startCoord.lat, lon: startCoord.lon },
      end: { lat: endCoord.lat, lon: endCoord.lon },
    });

    const body = {
      coordinates: [
        [startCoord.lon, startCoord.lat],
        [endCoord.lon, endCoord.lat],
      ],
      radiuses: [1500, 1500],
    };

    const routeUrl = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
    console.log("ORS request:", routeUrl, JSON.stringify(body));
    const routeRes = await fetchImpl(routeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!routeRes.ok) {
      const errorText = await routeRes.text();
      console.error("ORS error:", routeRes.status, errorText);
      return res.status(routeRes.status).json({ error: errorText });
    }

    const data = await routeRes.json();
    const feature = data && data.features ? data.features[0] : null;
    const summary = feature && feature.properties ? feature.properties.summary : null;
    const duration = summary ? summary.duration : null;
    const distance = summary ? summary.distance : null;
    const geometry = feature ? feature.geometry : null;

    return res.json({
      geometry,
      duration,
      distance,
      start: { label: startCoord.label, lat: startCoord.lat, lon: startCoord.lon },
      end: { label: endCoord.label, lat: endCoord.lat, lon: endCoord.lon },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao buscar rota." });
  }
});

app.get("/api/images", async (req, res) => {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "PEXELS_API_KEY não configurada." });
  }

  const q = (req.query && req.query.q ? String(req.query.q) : "").trim();
  if (!q) {
    return res.status(400).json({ error: "Query vazia." });
  }

  try {
    const url =
      "https://api.pexels.com/v1/search?per_page=10&orientation=landscape&query=" +
      encodeURIComponent(q);
    const response = await fetchImpl(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pexels error:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
    const data = await response.json();
    const photos = (data.photos || []).map((p) => ({
      id: p.id,
      url: p.url,
      photographer: p.photographer,
      src: p.src,
    }));
    return res.json({ photos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao buscar imagens." });
  }
});

async function geocodePlace(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query) +
    "&countrycodes=br&viewbox=-53.3,-25.3,-44.2,-19.6&bounded=1";
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": "JarvisApp/1.0",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || !data[0]) return null;
  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    label: data[0].display_name,
  };
}

app.get("/api/youtube-search", async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY não configurada." });
  }

  const q = (req.query && req.query.q ? String(req.query.q) : "").trim();
  if (!q) {
    return res.status(400).json({ error: "Query vazia." });
  }

  try {
    const url =
      "https://www.googleapis.com/youtube/v3/search" +
      "?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=" +
      encodeURIComponent(q) +
      "&key=" +
      encodeURIComponent(apiKey);
    const response = await fetchImpl(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("YouTube error:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
    const data = await response.json();
    const item = data.items && data.items[0];
    const videoId = item && item.id ? item.id.videoId : "";
    if (!videoId) {
      return res.json({ videoId: "" });
    }
    return res.json({ videoId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao chamar YouTube." });
  }
});

function extractOutputText(data) {
  if (!data || !Array.isArray(data.output)) return "";
  const parts = [];
  for (const item of data.output) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Jarvis server em http://localhost:${port}`);
});
