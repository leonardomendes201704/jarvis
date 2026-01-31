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
