import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";

const CONFIG_FILE = path.join(process.cwd(), "config.json");
const HISTORY_FILE = path.join(process.cwd(), "history.json");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Load config
  app.get("/api/config", async (req, res) => {
    try {
      const data = await fs.readFile(CONFIG_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (error) {
      // If file doesn't exist, return empty config
      res.json({});
    }
  });

  // API: Save config
  app.post("/api/config", async (req, res) => {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(req.body, null, 2));
      res.json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save config" });
    }
  });

  // API: Load history
  app.get("/api/history", async (req, res) => {
    try {
      const data = await fs.readFile(HISTORY_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (error) {
      res.json([]);
    }
  });

  // API: Save history entry
  app.post("/api/history", async (req, res) => {
    try {
      let history: any[] = [];
      try {
        const data = await fs.readFile(HISTORY_FILE, "utf-8");
        history = JSON.parse(data);
      } catch (_) {}
      history.unshift(req.body);
      if (history.length > 100) history = history.slice(0, 100);
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
      res.json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save history" });
    }
  });

  // API: Delete history entry
  app.delete("/api/history/:id", async (req, res) => {
    try {
      let history: any[] = [];
      try {
        const data = await fs.readFile(HISTORY_FILE, "utf-8");
        history = JSON.parse(data);
      } catch (_) {}
      history = history.filter((h: any) => h.id !== req.params.id);
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
      res.json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete history" });
    }
  });

  // API: Proxy for external LLM APIs to avoid CORS issues
  app.post("/api/proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: "Missing target URL" });
    }

    try {
      console.log(`Proxying ${method || 'POST'} request to: ${url}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      let response;
      try {
        response = await fetch(url, {
          method: method || "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      console.log(`Upstream response status: ${response.status}`);
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        if (!text.trim().startsWith('<')) {
          console.error("Proxy response parse error:", e);
        }
        data = { error: "Invalid JSON response from upstream", raw: text };
      }
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error("Proxy error:", error);
      const isTimeout = error?.name === 'AbortError';
      res.status(isTimeout ? 504 : 500).json({ 
        error: isTimeout ? "上游请求超时（30秒）" : "Proxy request failed", 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
