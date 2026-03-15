import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { createRequire } from "module";
import { OAuth2Client } from "google-auth-library";
import cookieSession from "cookie-session";

const require = createRequire(import.meta.url);
const { YoutubeTranscript } = require('youtube-transcript');
const { getSubtitles } = require('youtube-captions-scraper');

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || "ai-transcriber-secret";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn("⚠️ OAuth environment variables (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) are missing!");
} else {
  console.log("✅ OAuth environment variables found.");
}

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET
);

function getVideoId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  
  app.use(cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none'
  }));

  // Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: "OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in settings." 
      });
    }

    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const redirectUri = `${appUrl}/auth/google/callback`;
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      redirect_uri: redirectUri
    });
    res.json({ url });
  });

  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
    const { code } = req.query;
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const redirectUri = `${appUrl}/auth/google/callback`;

    try {
      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri
      });
      
      oauth2Client.setCredentials(tokens);
      
      const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      if (req.session) {
        req.session.user = userInfoResponse.data;
        req.session.tokens = tokens;
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OAuth Callback Error:", error.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // OpenRouter Proxy Endpoint
  app.post("/api/openrouter", async (req, res) => {
    try {
      const { model, messages, config, apiKey: userApiKey } = req.body;
      const apiKey = userApiKey || process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ 
          error: {
            message: "OpenRouter API Key is missing. Please provide it in settings.",
            code: "MISSING_API_KEY"
          }
        });
      }

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: model || "google/gemini-2.0-flash-001",
          messages: messages,
          ...config
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://ai.studio/build",
            "X-Title": "AI Transkripsi Audio & Video",
            "Content-Type": "application/json"
          }
        }
      );

      res.json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data || { error: { message: error.message } };
      
      console.error("OpenRouter Error:", errorData);
      
      // If it's an authentication error from OpenRouter, wrap it nicely
      if (status === 401) {
        return res.status(401).json({
          error: {
            message: "OpenRouter API Key is invalid or expired.",
            code: "INVALID_API_KEY",
            originalError: errorData
          }
        });
      }

      res.status(status).json(errorData);
    }
  });

  // YouTube Transcript Endpoint
  app.get("/api/youtube-transcript", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      let fullText = "";
      let lastError = "";
      let isTranscriptDisabled = false;
      
      // Method 1: youtube-transcript
      try {
        console.log(`Attempting Method 1 for: ${url}`);
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        fullText = transcript.map((t: any) => t.text).join(' ');
      } catch (e1: any) {
        lastError = e1.message;
        console.warn("Method 1 failed:", e1.message);
        if (e1.message.includes("Transcript is disabled")) {
          isTranscriptDisabled = true;
        }
      }

      // Method 2: youtube-captions-scraper (Fallback)
      if (!fullText) {
        const videoId = getVideoId(url);
        if (videoId) {
          console.log(`Attempting Method 2 (Fallback) for Video ID: ${videoId}`);
          // Try common languages
          const langs = ['en', 'id', 'ja', 'ko'];
          for (const lang of langs) {
            try {
              console.log(`Trying language: ${lang}`);
              const captions = await getSubtitles({
                videoID: videoId,
                lang: lang
              });
              if (captions && captions.length > 0) {
                fullText = captions.map((c: any) => c.text).join(' ');
                console.log(`Success with language: ${lang}`);
                break;
              }
            } catch (e2: any) {
              console.warn(`Method 2 (${lang}) failed:`, e2.message);
              // Only update lastError if it's not already a "disabled" error or if we haven't found anything better
              if (!isTranscriptDisabled) {
                lastError = e2.message;
              }
              if (e2.message.includes("Could not find captions") || e2.message.includes("disabled")) {
                isTranscriptDisabled = true;
              }
            }
          }
        }
      }

      if (!fullText) {
        if (isTranscriptDisabled) {
          return res.status(404).json({ 
            error: "Transkrip dinonaktifkan atau tidak ditemukan untuk video ini.",
            code: "TRANSCRIPT_DISABLED"
          });
        }
        throw new Error(lastError || "Gagal mengambil transkrip YouTube.");
      }
      
      res.json({ transcript: fullText });
    } catch (error: any) {
      console.error("YouTube Transcript Error:", error.message);
      res.status(500).json({ error: error.message || "Gagal mengambil transkrip YouTube." });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
