import express from "express";
import cors from "cors";
import { randomBytes } from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// ENV variables
const INTERNAL_API_KEY = process.env.HC_VIDEO_API_KEY;
const SORA_API_KEY = process.env.SORA_API_KEY;
const VIDFLY_API_KEY = process.env.VIDFLY_API_KEY;

// Simple in-memory task store
const tasks = {};

// Middleware auth
function auth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---- SORA ----
async function createVideoWithSora({ prompt, duration, aspectRatio }) {
  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SORA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sora-1",
      prompt,
      duration,
      aspect_ratio: aspectRatio || "16:9",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Sora error: " + JSON.stringify(data));
  }

  return { providerTaskId: data.id, provider: "sora" };
}

// ---- VIDFLY ----
async function createVideoWithVidfly({ prompt, avatar, voice, duration }) {
  const response = await fetch("https://api.vidfly.ai/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VIDFLY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      script: prompt,
      avatar_id: avatar || "hector_default",
      voice_id: voice || "hector_ai_voice",
      duration,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Vidfly error: " + JSON.stringify(data));
  }

  return { providerTaskId: data.id, provider: "vidfly" };
}

// ---- CREATE VIDEO ----
app.post("/create-video", auth, async (req, res) => {
  try {
    const {
      prompt,
      duration = 20,
      aspectRatio,
      avatar,
      voice,
      provider = "sora",
    } = req.body;

    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const taskId = randomBytes(8).toString("hex");

    tasks[taskId] = {
      status: "processing",
      provider,
      providerTaskId: null,
      fileUrl: null,
    };

    let providerResult;

    if (provider === "sora") {
      providerResult = await createVideoWithSora({ prompt, duration, aspectRatio });
    } else {
      providerResult = await createVideoWithVidfly({ prompt, avatar, voice, duration });
    }

    tasks[taskId].providerTaskId = providerResult.providerTaskId;

    res.json({ taskId, status: "processing" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- STATUS ----
app.get("/video-status/:id", auth, (req, res) => {
  const task = tasks[req.params.id];
  if (!task) return res.status(404).json({ error: "Task not found" });

  res.json(task);
});

// ---- FILE URL ----
app.get("/video-file/:id", auth, (req, res) => {
  const task = tasks[req.params.id];
  if (!task || !task.fileUrl)
    return res.status(400).json({ error: "Video not ready" });

  res.json({ fileUrl: task.fileUrl });
});

// ---- HEALTH CHECK ----
app.get("/", (req, res) => {
  res.json({ ok: true, service: "HC Video API" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 HC Video API running on port", PORT);
});
