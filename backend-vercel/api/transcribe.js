const MAX_BASE64_LENGTH = 7_000_000;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function extensionForMime(mime = "") {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Use POST."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "OPENAI_API_KEY não configurada no Vercel."
    });
  }

  const {
    audioBase64,
    mimeType = "audio/webm"
  } = req.body || {};

  if (
    typeof audioBase64 !== "string" ||
    audioBase64.length < 100
  ) {
    return res.status(400).json({
      error: "Áudio ausente ou inválido."
    });
  }

  if (audioBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({
      error: "Bloco de áudio grande demais."
    });
  }

  try {
    const bytes = Buffer.from(audioBase64, "base64");

    const form = new FormData();

    form.append(
      "file",
      new Blob([bytes], { type: mimeType }),
      `audio.${extensionForMime(mimeType)}`
    );

    form.append(
      "model",
      "gpt-4o-mini-transcribe"
    );

    form.append("language", "pt");

    form.append(
      "prompt",
      "Sala de aula em português do Brasil. Transcreva somente a fala audível. Preserve nomes próprios, termos pedagógicos, programação, robótica, matemática, ciências, SESI, PSC e acessibilidade. Não invente conteúdo quando houver silêncio."
    );

    form.append("response_format", "json");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: form
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      console.error(
        "OpenAI transcription error:",
        response.status,
        raw
      );

      return res.status(response.status).json({
        error: "A API de transcrição recusou a solicitação.",
        detail: raw.slice(0, 1200)
      });
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = { text: raw };
    }

    const text =
      String(data.text || "").trim();

    return res.status(200).json({
      ok: true,
      text
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Falha interna ao transcrever o áudio."
    });
  }
}
