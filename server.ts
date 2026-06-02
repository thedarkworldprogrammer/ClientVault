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

  async function getActivitiesCollection() {
    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      console.log("Lazy initialization: connected securely to MongoDB instance.");
    }
    const db = mongoClient.db("clientvault");
    return db.collection("activities");
  }

  async function getSharesCollection() {
    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      console.log("Lazy initialization: connected securely to MongoDB instance.");
    }
    const db = mongoClient.db("clientvault");
    return db.collection("shares");
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  async function logActivity(ownerId: string, action: string, fileName: string, details: string) {
    try {
      const collection = await getActivitiesCollection();
      await collection.insertOne({
        ownerId,
        action,
        fileName,
        details,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("Failed to write to activities log:", err);
    }
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
        tags: file.tags || [],
      }));

      res.json(formattedFiles);
    } catch (err: any) {
      console.error("MongoDB GET files error:", err);
      res.status(500).json({ error: err.message || "Unable to load files from storage engine." });
    }
  });

  // GET: Retrieve list of activities for a user
  app.get("/api/activities", async (req, res) => {
    try {
      const ownerId = req.query.ownerId as string;
      if (!ownerId) {
        return res.status(400).json({ error: "ownerId query parameter is mandatory" });
      }
      const collection = await getActivitiesCollection();
      const activities = await collection.find({ ownerId }).sort({ timestamp: -1 }).limit(50).toArray();

      const formattedActivities = activities.map((act) => ({
        id: act._id.toString(),
        ownerId: act.ownerId,
        action: act.action,
        fileName: act.fileName,
        details: act.details,
        timestamp: act.timestamp,
      }));

      res.json(formattedActivities);
    } catch (err: any) {
      console.error("MongoDB GET activities error:", err);
      res.status(500).json({ error: err.message || "Unable to load activities from telemetry engine." });
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
      const { name, size, type, ownerId, content, tags } = req.body;
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
        tags: Array.isArray(tags) ? tags : [],
      });
      await logActivity(
        ownerId,
        "UPLOAD",
        name,
        `Uploaded file (${formatSize(Number(size))})` + (Array.isArray(tags) && tags.length > 0 ? ` with initial tags: ${tags.join(", ")}` : "")
      );
      res.status(201).json({ id: result.insertedId.toString(), success: true });
    } catch (err: any) {
      console.error("MongoDB POST file error:", err);
      res.status(500).json({ error: err.message || "Unable to save file into storage engine." });
    }
  });

  // PUT: Update file tags
  app.put("/api/files/:id/tags", async (req, res) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;
      if (!id || !Array.isArray(tags)) {
        return res.status(400).json({ error: "id path parameter and tags array are required" });
      }
      const collection = await getFilesCollection();
      const file = await collection.findOne({ _id: new ObjectId(id) });
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { tags } }
      );
      await logActivity(
        file.ownerId,
        "TAG_UPDATE",
        file.name,
        tags.length > 0 ? `Assigned tags: ${tags.join(", ")}` : "Removed all tags from the file."
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("MongoDB PUT file tags error:", err);
      res.status(500).json({ error: err.message || "Unable to update file tags." });
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
      const file = await collection.findOne({ _id: new ObjectId(id) });
      if (!file) {
        return res.status(404).json({ error: "File not found or previously expunged" });
      }
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "File not found or previously expunged" });
      }
      await logActivity(
        file.ownerId,
        "DELETE",
        file.name,
        "Permanently shredded and purged from secure storage container."
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("MongoDB DELETE file error:", err);
      res.status(500).json({ error: err.message || "Unable to purge file from storage engine." });
    }
  });

  // POST: Bulk de-register and purge doc payloads from MongoDB
  app.post("/api/files/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array parameter is mandatory and must not be empty" });
      }
      const collection = await getFilesCollection();
      const objectIds = ids.map(id => new ObjectId(id));
      
      const files = await collection.find({ _id: { $in: objectIds } }).toArray();
      if (files.length === 0) {
        return res.status(404).json({ error: "No matching files found or previously expunged" });
      }
      
      const result = await collection.deleteMany({ _id: { $in: objectIds } });
      
      for (const file of files) {
        await logActivity(
          file.ownerId,
          "DELETE",
          file.name,
          "Permanently shredded and purged during a multiple-file batch delete operation."
        );
      }
      
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err: any) {
      console.error("MongoDB bulk DELETE error:", err);
      res.status(500).json({ error: err.message || "Unable to batch purge files from storage engine." });
    }
  });

  // POST: Generate temporary secure share link metadata
  app.post("/api/shares", async (req, res) => {
    try {
      const { fileId, expiresInMinutes, ownerId } = req.body;
      if (!fileId || !expiresInMinutes || !ownerId) {
        return res.status(400).json({ error: "fileId, expiresInMinutes, and ownerId parameters are required" });
      }
      const filesCol = await getFilesCollection();
      const file = await filesCol.findOne({ _id: new ObjectId(fileId), ownerId });
      if (!file) {
        return res.status(404).json({ error: "File asset not found or access denied." });
      }

      const sharesCol = await getSharesCollection();
      // Cryptographically stable random shares token string
      const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60 * 1000);

      await sharesCol.insertOne({
        token,
        fileId: new ObjectId(fileId),
        ownerId,
        expiresAt,
        createdAt: new Date()
      });

      await logActivity(
        ownerId,
        "SHARE_GENERATE",
        file.name,
        `Generated temporary secure read-only public sharing link active for ${expiresInMinutes} minutes.`
      );

      res.status(201).json({ token, expiresAt });
    } catch (err: any) {
      console.error("MongoDB POST share link error:", err);
      res.status(500).json({ error: err.message || "Unable to generate temporary share link." });
    }
  });

  // GET: Fetch shared file read-only metadata securely without credentials, verifying expiration
  app.get("/api/shares/:token", async (req, res) => {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ error: "Secure share token parameter is required." });
      }
      const sharesCol = await getSharesCollection();
      const share = await sharesCol.findOne({ token });
      if (!share) {
        return res.status(404).json({ error: "Secure link is invalid or has expired." });
      }

      if (new Date() > new Date(share.expiresAt)) {
        // Automatically prune expired token
        await sharesCol.deleteOne({ _id: share._id });
        return res.status(410).json({ error: "This secure sharing link has expired." });
      }

      const filesCol = await getFilesCollection();
      const file = await filesCol.findOne({ _id: share.fileId });
      if (!file) {
        return res.status(404).json({ error: "The shared file has been deleted from secure storage vaults." });
      }

      // Return a read-only, sanitized representation of the shared file
      res.json({
        id: file._id.toString(),
        name: file.name,
        size: file.size,
        type: file.type,
        content: file.content,
        uploadedAt: file.uploadedAt,
        tags: file.tags || []
      });
    } catch (err: any) {
      console.error("MongoDB GET shared file error:", err);
      res.status(500).json({ error: err.message || "Unable to fetch shared asset." });
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
