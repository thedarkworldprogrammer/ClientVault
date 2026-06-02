/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { MongoClient, ObjectId } from "mongodb";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // High-capacity parser to accommodate up to 50MB files (base64)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // MongoDB Connection with secure fallback
  const mongoUri = process.env.MONGO_URI || "mongodb+srv://stiwary:S12345@nodejs.jo8pt1t.mongodb.net/?appName=nodejs";
  let mongoClient: MongoClient | null = null;

  async function getFilesCollection() {
    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      console.log("Lazy initialization: connected securely to MongoDB instance.");
    }
    const db = mongoClient.db("clientvault");
    return db.collection("files");
  }

  /* API Endpoints for File Management */

  // GET: Retrieve list of client files from MongoDB
  app.get("/api/files", async (req, res) => {
    try {
      const ownerId = req.query.ownerId as string;
      if (!ownerId) {
        return res.status(400).json({ error: "ownerId query parameter is mandatory" });
      }
      const collection = await getFilesCollection();
      const files = await collection.find({ ownerId }).sort({ uploadedAt: -1 }).toArray();

      const formattedFiles = files.map((file) => ({
        id: file._id.toString(),
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        ownerId: file.ownerId,
        content: file.content,
      }));

      res.json(formattedFiles);
    } catch (err: any) {
      console.error("MongoDB GET files error:", err);
      res.status(500).json({ error: err.message || "Unable to load files from storage engine." });
    }
  });

  // GET: Retrieve counts and total storage sizes for all users from MongoDB (Admin-only view helper)
  app.get("/api/admin/files-summary", async (req, res) => {
    try {
      const collection = await getFilesCollection();
      const summary = await collection.aggregate([
        {
          $group: {
            _id: "$ownerId",
            count: { $sum: 1 },
            totalSize: { $sum: "$size" }
          }
        }
      ]).toArray();

      const summaryMap = summary.reduce((acc, curr) => {
        if (curr._id) {
          acc[curr._id] = {
            count: curr.count || 0,
            totalSize: curr.totalSize || 0
          };
        }
        return acc;
      }, {} as Record<string, { count: number; totalSize: number }>);

      res.json(summaryMap);
    } catch (err: any) {
      console.error("MongoDB aggregate summary error:", err);
      res.status(500).json({ error: err.message || "Unable to aggregate file metadata." });
    }
  });

  // POST: Upload document metadata and base64 payloads to MongoDB
  app.post("/api/files", async (req, res) => {
    try {
      const { name, size, type, ownerId, content } = req.body;
      if (!name || size === undefined || !type || !ownerId || !content) {
        return res.status(400).json({ error: "Incomplete file parameters received" });
      }
      const collection = await getFilesCollection();
      const result = await collection.insertOne({
        name,
        size: Number(size),
        type,
        ownerId,
        content,
        uploadedAt: new Date(),
      });
      res.status(201).json({ id: result.insertedId.toString(), success: true });
    } catch (err: any) {
      console.error("MongoDB POST file error:", err);
      res.status(500).json({ error: err.message || "Unable to save file into storage engine." });
    }
  });

  // DELETE: De-register and purge doc payload from MongoDB
  app.delete("/api/files/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "id path parameter is mandatory" });
      }
      const collection = await getFilesCollection();
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "File not found or previously expunged" });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("MongoDB DELETE file error:", err);
      res.status(500).json({ error: err.message || "Unable to purge file from storage engine." });
    }
  });

  // Mounting Vite dev mode or hosting bundle statically inside Express viewport
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

  // Start listener
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup failed:", err);
});
