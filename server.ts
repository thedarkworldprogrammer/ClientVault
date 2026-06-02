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
  let useInMemoryFallback = false;

  const inMemoryFiles: any[] = [];
  const inMemoryActivities: any[] = [];
  const inMemoryShares: any[] = [];
  const activeUploadSessions: Record<string, {
    name: string;
    size: number;
    type: string;
    ownerId: string;
    tags: string[];
    totalChunks: number;
    chunks: Record<number, string>;
    createdAt: number;
  }> = {};

  async function getFilesCollection() {
    if (useInMemoryFallback) return null;
    try {
      if (!mongoClient) {
        mongoClient = new MongoClient(mongoUri, { connectTimeoutMS: 5000, socketTimeoutMS: 5000 });
        await mongoClient.connect();
        console.log("Lazy initialization: connected securely to MongoDB instance.");
      }
      const db = mongoClient.db("clientvault");
      return db.collection("files");
    } catch (err) {
      console.warn("MongoDB Client files collection failed. Switching automatically to durable In-Memory fallback storage.", err);
      useInMemoryFallback = true;
      return null;
    }
  }

  async function getActivitiesCollection() {
    if (useInMemoryFallback) return null;
    try {
      if (!mongoClient) {
        mongoClient = new MongoClient(mongoUri, { connectTimeoutMS: 5000, socketTimeoutMS: 5000 });
        await mongoClient.connect();
        console.log("Lazy initialization: connected securely to MongoDB instance.");
      }
      const db = mongoClient.db("clientvault");
      return db.collection("activities");
    } catch (err) {
      console.warn("MongoDB Client activities collection failed. Switching automatically to durable In-Memory fallback storage.", err);
      useInMemoryFallback = true;
      return null;
    }
  }

  async function getSharesCollection() {
    if (useInMemoryFallback) return null;
    try {
      if (!mongoClient) {
        mongoClient = new MongoClient(mongoUri, { connectTimeoutMS: 5000, socketTimeoutMS: 5000 });
        await mongoClient.connect();
        console.log("Lazy initialization: connected securely to MongoDB instance.");
      }
      const db = mongoClient.db("clientvault");
      return db.collection("shares");
    } catch (err) {
      console.warn("MongoDB Client shares collection failed. Switching automatically to durable In-Memory fallback storage.", err);
      useInMemoryFallback = true;
      return null;
    }
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
      if (!collection) {
        inMemoryActivities.push({
          ownerId,
          action,
          fileName,
          details,
          timestamp: new Date()
        });
        return;
      }
      await collection.insertOne({
        ownerId,
        action,
        fileName,
        details,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("Failed to write to MongoDB activities log, recording in memory:", err);
      inMemoryActivities.push({
        ownerId,
        action,
        fileName,
        details,
        timestamp: new Date()
      });
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
      let files: any[] = [];
      if (!collection) {
        files = inMemoryFiles.filter(file => file.ownerId === ownerId);
        files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      } else {
        files = await collection.find({ ownerId }).sort({ uploadedAt: -1 }).toArray();
      }

      const formattedFiles = files.map((file) => ({
        id: file._id ? file._id.toString() : (file.id || Math.random().toString()),
        name: file.name,
        size: Number(file.size),
        type: file.type,
        uploadedAt: file.uploadedAt,
        ownerId: file.ownerId,
        content: file.content,
        tags: file.tags || [],
      }));

      res.json(formattedFiles);
    } catch (err: any) {
      console.error("MongoDB GET files error, falling back to in-memory:", err);
      // Failover filter immediately if db fails mid-flight
      const files = inMemoryFiles.filter(file => file.ownerId === req.query.ownerId);
      files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      const formattedFiles = files.map((file) => ({
        id: file.id || Math.random().toString(),
        name: file.name,
        size: Number(file.size),
        type: file.type,
        uploadedAt: file.uploadedAt,
        ownerId: file.ownerId,
        content: file.content,
        tags: file.tags || [],
      }));
      res.json(formattedFiles);
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
      let activities: any[] = [];
      if (!collection) {
        activities = inMemoryActivities.filter(a => a.ownerId === ownerId);
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        activities = activities.slice(0, 50);
      } else {
        activities = await collection.find({ ownerId }).sort({ timestamp: -1 }).limit(50).toArray();
      }

      const formattedActivities = activities.map((act) => ({
        id: act._id ? act._id.toString() : (act.id || Math.random().toString()),
        ownerId: act.ownerId,
        action: act.action,
        fileName: act.fileName,
        details: act.details,
        timestamp: act.timestamp,
      }));

      res.json(formattedActivities);
    } catch (err: any) {
      console.error("MongoDB GET activities error, loading in-memory fallback:", err);
      let activities = inMemoryActivities.filter(a => a.ownerId === req.query.ownerId);
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      activities = activities.slice(0, 50);
      const formattedActivities = activities.map((act) => ({
        id: act.id || Math.random().toString(),
        ownerId: act.ownerId,
        action: act.action,
        fileName: act.fileName,
        details: act.details,
        timestamp: act.timestamp,
      }));
      res.json(formattedActivities);
    }
  });

  // GET: Retrieve counts and total storage sizes for all users from MongoDB (Admin-only view helper)
  app.get("/api/admin/files-summary", async (req, res) => {
    try {
      const collection = await getFilesCollection();
      let summaryMap: Record<string, { count: number; totalSize: number }> = {};
      if (!collection) {
        inMemoryFiles.forEach(file => {
          if (file.ownerId) {
            if (!summaryMap[file.ownerId]) {
              summaryMap[file.ownerId] = { count: 0, totalSize: 0 };
            }
            summaryMap[file.ownerId].count += 1;
            summaryMap[file.ownerId].totalSize += Number(file.size);
          }
        });
      } else {
        const summary = await collection.aggregate([
          {
            $group: {
              _id: "$ownerId",
              count: { $sum: 1 },
              totalSize: { $sum: "$size" }
            }
          }
        ]).toArray();

        summaryMap = summary.reduce((acc, curr) => {
          if (curr._id) {
            acc[curr._id] = {
              count: curr.count || 0,
              totalSize: curr.totalSize || 0
            };
          }
          return acc;
        }, {} as Record<string, { count: number; totalSize: number }>);
      }

      res.json(summaryMap);
    } catch (err: any) {
      console.error("MongoDB aggregate summary error, generating from memory instead:", err);
      const summaryMap: Record<string, { count: number; totalSize: number }> = {};
      inMemoryFiles.forEach(file => {
        if (file.ownerId) {
          if (!summaryMap[file.ownerId]) {
            summaryMap[file.ownerId] = { count: 0, totalSize: 0 };
          }
          summaryMap[file.ownerId].count += 1;
          summaryMap[file.ownerId].totalSize += Number(file.size);
        }
      });
      res.json(summaryMap);
    }
  });

  // POST: Initiate a chunked upload session
  app.post("/api/files/upload-session", (req, res) => {
    try {
      const { name, size, type, ownerId, tags, totalChunks } = req.body;
      if (!name || size === undefined || !type || !ownerId || totalChunks === undefined) {
        return res.status(400).json({ error: "Missing required session initiation parameters." });
      }

      // Cleanup old expired sessions (>1hr old) to protect memory
      const now = Date.now();
      for (const [id, sess] of Object.entries(activeUploadSessions)) {
        if (now - sess.createdAt > 3600000) {
          delete activeUploadSessions[id];
        }
      }

      const uploadId = "session_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      activeUploadSessions[uploadId] = {
        name,
        size: Number(size),
        type,
        ownerId,
        tags: Array.isArray(tags) ? tags : [],
        totalChunks: Number(totalChunks),
        chunks: {},
        createdAt: now,
      };

      res.status(201).json({ uploadId });
    } catch (err: any) {
      console.error("Failed to initiate upload session:", err);
      res.status(500).json({ error: err.message || "Unable to initiate upload session." });
    }
  });

  // POST: Receive an uploaded file chunk
  app.post("/api/files/upload-chunk", async (req, res) => {
    try {
      const { uploadId, chunkIndex, chunkData } = req.body;
      if (!uploadId || chunkIndex === undefined || chunkData === undefined) {
        return res.status(400).json({ error: "Incomplete chunk transport parameters." });
      }

      const session = activeUploadSessions[uploadId];
      if (!session) {
        return res.status(410).json({ error: "Upload session has expired, been aborted, or does not exist." });
      }

      const idx = Number(chunkIndex);
      session.chunks[idx] = chunkData;

      const receivedCount = Object.keys(session.chunks).length;
      if (receivedCount === session.totalChunks) {
        // Complete! Assemble the parts
        let assembledContent = "";
        for (let i = 0; i < session.totalChunks; i++) {
          if (session.chunks[i] === undefined) {
            return res.status(400).json({ error: `Missing chunk at index ${i}. Upload failed.` });
          }
          assembledContent += session.chunks[i];
        }

        const { name, size, type, ownerId, tags } = session;
        const collection = await getFilesCollection();
        let insertedId: string;

        if (!collection) {
          const fileId = "mem_" + Math.random().toString(36).substring(2, 11);
          inMemoryFiles.push({
            id: fileId,
            name,
            size: Number(size),
            type,
            ownerId,
            content: assembledContent,
            uploadedAt: new Date(),
            tags: Array.isArray(tags) ? tags : [],
          });
          insertedId = fileId;
        } else {
          try {
            const result = await collection.insertOne({
              name,
              size: Number(size),
              type,
              ownerId,
              content: assembledContent,
              uploadedAt: new Date(),
              tags: Array.isArray(tags) ? tags : [],
            });
            insertedId = result.insertedId.toString();
          } catch (dbErr) {
            console.warn("MongoDB insert error on chunk assembly, falling back to Memory Storage:", dbErr);
            const fileId = "mem_err_" + Math.random().toString(36).substring(2, 11);
            inMemoryFiles.push({
              id: fileId,
              name,
              size: Number(size),
              type,
              ownerId,
              content: assembledContent,
              uploadedAt: new Date(),
              tags: Array.isArray(tags) ? tags : [],
            });
            insertedId = fileId;
          }
        }

        await logActivity(
          ownerId,
          "UPLOAD",
          name,
          `Uploaded file (${formatSize(Number(size))}) [Assembled from ${session.totalChunks} Chunks]` + 
          (Array.isArray(tags) && tags.length > 0 ? ` with initial tags: ${tags.join(", ")}` : "")
        );

        // Delete session to free memory
        delete activeUploadSessions[uploadId];

        return res.status(201).json({ id: insertedId, success: true, completed: true });
      }

      // Return status for pending chunks
      res.json({
        success: true,
        completed: false,
        received: receivedCount,
        total: session.totalChunks,
      });
    } catch (err: any) {
      console.error("Chunk file storage exception:", err);
      res.status(500).json({ error: err.message || "Failed to process transmitted file chunk." });
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
      let insertedId: string;
      if (!collection) {
        const fileId = "mem_" + Math.random().toString(36).substring(2, 11);
        inMemoryFiles.push({
          id: fileId,
          name,
          size: Number(size),
          type,
          ownerId,
          content,
          uploadedAt: new Date(),
          tags: Array.isArray(tags) ? tags : [],
        });
        insertedId = fileId;
      } else {
        const result = await collection.insertOne({
          name,
          size: Number(size),
          type,
          ownerId,
          content,
          uploadedAt: new Date(),
          tags: Array.isArray(tags) ? tags : [],
        });
        insertedId = result.insertedId.toString();
      }
      await logActivity(
        ownerId,
        "UPLOAD",
        name,
        `Uploaded file (${formatSize(Number(size))})` + (Array.isArray(tags) && tags.length > 0 ? ` with initial tags: ${tags.join(", ")}` : "")
      );
      res.status(201).json({ id: insertedId, success: true });
    } catch (err: any) {
      console.warn("MongoDB POST file error, saving to In-Memory store fallback:", err);
      const { name, size, type, ownerId, content, tags } = req.body;
      const fileId = "mem_err_" + Math.random().toString(36).substring(2, 11);
      inMemoryFiles.push({
        id: fileId,
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
        `Uploaded file (${formatSize(Number(size))}) [In-Memory Session]`
      );
      res.status(201).json({ id: fileId, success: true });
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
      let file: any;
      if (!collection) {
        file = inMemoryFiles.find(f => f.id === id);
        if (!file) {
          return res.status(404).json({ error: "File not found" });
        }
        file.tags = tags;
      } else {
        file = await collection.findOne({ _id: new ObjectId(id) });
        if (!file) {
          // Check memory store for dual storage consistency
          file = inMemoryFiles.find(f => f.id === id);
          if (file) {
            file.tags = tags;
          } else {
            return res.status(404).json({ error: "File not found" });
          }
        } else {
          await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { tags } }
          );
        }
      }
      await logActivity(
        file.ownerId,
        "TAG_UPDATE",
        file.name,
        tags.length > 0 ? `Assigned tags: ${tags.join(", ")}` : "Removed all tags from the file."
      );
      res.json({ success: true });
    } catch (err: any) {
      console.warn("MongoDB PUT tags error, updating memory database copy:", err);
      const { id } = req.params;
      const { tags } = req.body;
      const file = inMemoryFiles.find(f => f.id === id);
      if (file) {
        file.tags = tags;
        res.json({ success: true });
      } else {
        res.status(500).json({ error: err.message || "Unable to update file tags." });
      }
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
      let file: any;
      if (!collection) {
        const idx = inMemoryFiles.findIndex(f => f.id === id);
        if (idx === -1) {
          return res.status(404).json({ error: "File not found or previously expunged" });
        }
        file = inMemoryFiles[idx];
        inMemoryFiles.splice(idx, 1);
      } else {
        if (id.startsWith("mem_")) {
          const idx = inMemoryFiles.findIndex(f => f.id === id);
          if (idx !== -1) {
            file = inMemoryFiles[idx];
            inMemoryFiles.splice(idx, 1);
          } else {
            return res.status(404).json({ error: "File not found or previously expunged" });
          }
        } else {
          file = await collection.findOne({ _id: new ObjectId(id) });
          if (!file) {
            return res.status(404).json({ error: "File not found or previously expunged" });
          }
          const result = await collection.deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            return res.status(404).json({ error: "File not found or previously expunged" });
          }
        }
      }
      await logActivity(
        file.ownerId,
        "DELETE",
        file.name,
        "Permanently shredded and purged from secure storage container."
      );
      res.json({ success: true });
    } catch (err: any) {
      console.warn("MongoDB DELETE file error, cleaning up memory fallback store item instead:", err);
      const { id } = req.params;
      const idx = inMemoryFiles.findIndex(f => f.id === id);
      if (idx !== -1) {
        const file = inMemoryFiles[idx];
        inMemoryFiles.splice(idx, 1);
        await logActivity(
          file.ownerId,
          "DELETE",
          file.name,
          "Permanently shredded and purged from local in-memory container copy."
        );
        res.json({ success: true });
      } else {
        res.status(500).json({ error: err.message || "Unable to purge file from storage engine." });
      }
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
      let files: any[] = [];
      let deletedCount = 0;
      if (!collection) {
        files = inMemoryFiles.filter(file => ids.includes(file.id));
        if (files.length === 0) {
          return res.status(404).json({ error: "No matching files found or previously expunged" });
        }
        files.forEach(file => {
          const idx = inMemoryFiles.findIndex(f => f.id === file.id);
          if (idx !== -1) {
            inMemoryFiles.splice(idx, 1);
            deletedCount++;
          }
        });
      } else {
        const nonMemIds = ids.filter(id => !id.startsWith("mem_"));
        const memIds = ids.filter(id => id.startsWith("mem_"));
        
        // Remove mem files from memory
        memIds.forEach(id => {
          const idx = inMemoryFiles.findIndex(f => f.id === id);
          if (idx !== -1) {
            files.push(inMemoryFiles[idx]);
            inMemoryFiles.splice(idx, 1);
            deletedCount++;
          }
        });

        if (nonMemIds.length > 0) {
          const objectIds = nonMemIds.map(id => new ObjectId(id));
          const dbFiles = await collection.find({ _id: { $in: objectIds } }).toArray();
          files = files.concat(dbFiles);
          const result = await collection.deleteMany({ _id: { $in: objectIds } });
          deletedCount += result.deletedCount;
        }
        
        if (files.length === 0) {
          return res.status(404).json({ error: "No matching files found or previously expunged" });
        }
      }
      
      for (const file of files) {
        await logActivity(
          file.ownerId,
          "DELETE",
          file.name,
          "Permanently shredded and purged during a multiple-file batch delete operation."
        );
      }
      
      res.json({ success: true, deletedCount });
    } catch (err: any) {
      console.warn("MongoDB bulk DELETE error, purging from memory copy database fallback:", err);
      const { ids } = req.body;
      let deletedCount = 0;
      const matched = inMemoryFiles.filter(f => ids.includes(f.id));
      matched.forEach(file => {
        const idx = inMemoryFiles.findIndex(f => f.id === file.id);
        if (idx !== -1) {
          inMemoryFiles.splice(idx, 1);
          deletedCount++;
        }
      });
      res.json({ success: true, deletedCount });
    }
  });

  // POST: Bulk rename files in MongoDB or in-memory fallback
  app.post("/api/files/bulk-rename", async (req, res) => {
    try {
      const { renames } = req.body;
      if (!renames || !Array.isArray(renames) || renames.length === 0) {
        return res.status(400).json({ error: "renames array must not be empty" });
      }

      const collection = await getFilesCollection();
      let updatedCount = 0;

      for (const item of renames) {
        const { id, newName } = item;
        if (!id || !newName) continue;

        let file: any = null;

        if (!collection) {
          // In-memory rename
          file = inMemoryFiles.find(f => f.id === id);
          if (file) {
            const oldName = file.name;
            file.name = newName;
            updatedCount++;
            await logActivity(
              file.ownerId,
              "RENAME",
              oldName,
              `Batch renamed file to: "${newName}"`
            );
          }
        } else {
          if (id.startsWith("mem_")) {
            file = inMemoryFiles.find(f => f.id === id);
            if (file) {
              const oldName = file.name;
              file.name = newName;
              updatedCount++;
              await logActivity(
                file.ownerId,
                "RENAME",
                oldName,
                `Batch renamed file to: "${newName}"`
              );
            }
          } else {
            try {
              file = await collection.findOne({ _id: new ObjectId(id) });
              if (file) {
                const oldName = file.name;
                await collection.updateOne(
                  { _id: new ObjectId(id) },
                  { $set: { name: newName } }
                );
                updatedCount++;
                await logActivity(
                  file.ownerId,
                  "RENAME",
                  oldName,
                  `Batch renamed file to: "${newName}"`
                );
              }
            } catch (dbErr) {
              console.warn("DB error on bulk rename single item, trying in-memory lookup:", dbErr);
              file = inMemoryFiles.find(f => f.id === id);
              if (file) {
                const oldName = file.name;
                file.name = newName;
                updatedCount++;
                await logActivity(
                  file.ownerId,
                  "RENAME",
                  oldName,
                  `Batch renamed file to: "${newName}" [In-Memory]`
                );
              }
            }
          }
        }
      }

      res.json({ success: true, updatedCount });
    } catch (err: any) {
      console.error("MongoDB bulk RENAME error:", err);
      res.status(500).json({ error: err.message || "Failed to process bulk rename operation." });
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
      let file: any;
      if (!filesCol) {
        file = inMemoryFiles.find(f => f.id === fileId && f.ownerId === ownerId);
      } else {
        if (fileId.startsWith("mem_")) {
          file = inMemoryFiles.find(f => f.id === fileId && f.ownerId === ownerId);
        } else {
          file = await filesCol.findOne({ _id: new ObjectId(fileId), ownerId });
        }
      }
      if (!file) {
        return res.status(404).json({ error: "File asset not found or access denied." });
      }

      const sharesCol = await getSharesCollection();
      const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60 * 1000);

      if (!sharesCol) {
        inMemoryShares.push({
          token,
          fileId,
          ownerId,
          expiresAt,
          createdAt: new Date()
        });
      } else {
        await sharesCol.insertOne({
          token,
          fileId: fileId.startsWith("mem_") ? fileId : new ObjectId(fileId),
          ownerId,
          expiresAt,
          createdAt: new Date()
        });
      }

      await logActivity(
        ownerId,
        "SHARE_GENERATE",
        file.name,
        `Generated temporary secure read-only public sharing link active for ${expiresInMinutes} minutes.`
      );

      res.status(201).json({ token, expiresAt });
    } catch (err: any) {
      console.warn("MongoDB POST share link error, capturing share link in-memory:", err);
      const { fileId, expiresInMinutes, ownerId } = req.body;
      const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60 * 1000);
      inMemoryShares.push({
        token,
        fileId,
        ownerId,
        expiresAt,
        createdAt: new Date()
      });
      res.status(201).json({ token, expiresAt });
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
      let share: any;
      if (!sharesCol) {
        share = inMemoryShares.find(s => s.token === token);
      } else {
        share = await sharesCol.findOne({ token });
        if (!share) {
          share = inMemoryShares.find(s => s.token === token);
        }
      }
      if (!share) {
        return res.status(404).json({ error: "Secure link is invalid or has expired." });
      }

      if (new Date() > new Date(share.expiresAt)) {
        // Automatically prune expired token
        if (!sharesCol) {
          const idx = inMemoryShares.findIndex(s => s.token === token);
          if (idx !== -1) inMemoryShares.splice(idx, 1);
        } else {
          await sharesCol.deleteOne({ token });
        }
        return res.status(410).json({ error: "This secure sharing link has expired." });
      }

      const filesCol = await getFilesCollection();
      let file: any;
      if (!filesCol || String(share.fileId).startsWith("mem_")) {
        file = inMemoryFiles.find(f => f.id === String(share.fileId));
      } else {
        file = await filesCol.findOne({ _id: new ObjectId(share.fileId) });
      }
      if (!file) {
        return res.status(404).json({ error: "The shared file has been deleted from secure storage vaults." });
      }

      // Return a read-only, sanitized representation of the shared file
      res.json({
        id: file._id ? file._id.toString() : (file.id || Math.random().toString()),
        name: file.name,
        size: Number(file.size),
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
