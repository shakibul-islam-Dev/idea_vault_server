require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;
const cookieParser = require("cookie-parser");
app.use(cookieParser());
app.use(express.json());
app.use((req, res, next) => {
  next();
});

// CORS Configuration
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
// JWT Token Verification Setup
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWK Token URL (Better Auth থেকে আসা টোকেন ভেরিফাই করার জন্য)
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL || "http://localhost:3000"}/api/auth/jwks`),
);

// MiddleWare for Authentication (Fixed: Added JWT verification fallback)
const verifyToken = async (req, res, next) => {
  let token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    token = req.cookies?.["better-auth.session_token"];
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    // ১. প্রথমে JWT টোকেন ভেরিফাই করার চেষ্টা করবে (যেটা আগে মিসিং ছিল)
    try {
      const { payload } = await jwtVerify(token, JWKS);
      // ভেরিফিকেশন সফল হলে req.user এ ডাটা সেট করে দিবে
      req.user = { id: payload.sub, _id: payload.sub, ...payload };
      return next();
    } catch (jwtError) {
      // ২. যদি JWT না হয়, তবে আগের মতো সরাসরি ডাটাবেস থেকে সেশন খুঁজবে
      const db = client.db("IdeaVault");

      const session = await db.collection("session").findOne({ token: token });

      if (!session) {
        return res
          .status(403)
          .json({ message: "Session invalid or not found" });
      }

      const user = await db.collection("user").findOne({ id: session.userId });

      if (!user) {
        // REMOVED DUPLICATE: const { ObjectId } = require("mongodb"); was removed from here
        try {
          const userByObjId = await db
            .collection("user")
            .findOne({ _id: new ObjectId(session.userId) });
          if (userByObjId) {
            req.user = userByObjId;
            return next();
          }
        } catch (e) {}

        console.error("User not found for userId:", session.userId);
        return res.status(403).json({ message: "User not found" });
      }

      req.user = user;
      next();
    }
  } catch (error) {
    console.error("Verification Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

async function run() {
  try {
    await client.connect();
    const db = client.db("IdeaVault");
    const dataBaseCollection = db.collection("IdeaVaults");
    const bookingCollection = db.collection("bookings");
    const commentCollection = db.collection("comments");
    const activitiesCollection = db.collection("activities");

    // ==========================================
    // IDEA ROUTES (Fixed)
    // ==========================================

    app.post("/api/idea", verifyToken, async (req, res) => {
      try {
        const { userId, ...formData } = req.body;
        const currentUserId = req.user.id || req.user._id;

        const newIdea = {
          ...formData,
          userId: currentUserId,
          createdAt: new Date(),
        };

        const result = await dataBaseCollection.insertOne(newIdea);
        res.status(201).json(result);
      } catch (error) {
        console.error("Error creating idea:", error);
        res.status(500).json({ error: "Failed to create idea" });
      }
    });

    app.get("/api/idea", async (req, res) => {
      try {
        const category = req.query.category || "";
        const search = req.query.search || "";
        const userId = req.query.userId || null;

        let query = {};

        if (userId) query.userId = userId;
        if (category && category !== "All") query.category = category;

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { ideaTitle: { $regex: search, $options: "i" } },
            { content: { $regex: search, $options: "i" } },
            { shortDescription: { $regex: search, $options: "i" } },
          ];
        }

        const result = await dataBaseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        console.error("Fetch ideas error:", error);
        res.status(500).json({ error: "Failed to fetch ideas" });
      }
    });

    app.get("/api/idea/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid ID format" });

        const result = await dataBaseCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) return res.status(404).json({ error: "Idea not found" });

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.patch("/api/idea/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid ID format" });

        const updatedData = req.body;
        const result = await dataBaseCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );

        if (result.matchedCount === 0)
          return res.status(404).json({ error: "Idea not found" });
        res.json({ message: "Idea updated successfully", result });
      } catch (error) {
        res.status(500).json({ error: "Failed to update idea" });
      }
    });

    app.delete("/api/idea/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid ID format" });

        const result = await dataBaseCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ error: "Idea not found" });

        res.json({ message: "Idea deleted successfully", result });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete idea" });
      }
    });

    // ==========================================
    // ACTIVITY ROUTES
    // ==========================================

    app.get("/api/activity", verifyToken, async (req, res) => {
      try {
        // userId বের করার লজিক একটু আপডেট করা হয়েছে যেন undefined না হয়
        const userId = req.user.sub || req.user.id || req.user._id?.toString();
        const result = await activitiesCollection
          .find({ userId: userId })
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Fetch activities error:", error);
        res.status(500).json({ error: "Failed to fetch activities" });
      }
    });

    app.delete("/api/activity/:id", verifyToken, async (req, res) => {
      try {
        const activityId = req.params.id;
        const userId = req.user.sub || req.user.id || req.user._id?.toString();

        if (!ObjectId.isValid(activityId))
          return res.status(400).json({ error: "Invalid ID format" });

        const result = await activitiesCollection.deleteOne({
          _id: new ObjectId(activityId),
          userId: userId,
        });

        res.json(result);
      } catch (error) {
        console.error("Error deleting activity:", error);
        res.status(500).json({ error: "Failed to delete activity" });
      }
    });

    // ==========================================
    // BOOKING ROUTES
    // ==========================================

    app.get("/api/bookings", async (req, res) => {
      try {
        const result = await bookingCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bookings" });
      }
    });

    app.post("/api/bookings", async (req, res) => {
      try {
        const bookingData = req.body;
        const result = await bookingCollection.insertOne(bookingData);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to create booking" });
      }
    });

    // ==========================================
    // COMMENT ROUTES
    // ==========================================

    app.get("/api/comments", async (req, res) => {
      try {
        const result = await commentCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch comments" });
      }
    });

    app.post("/api/comments", verifyToken, async (req, res) => {
      try {
        const userId = req.user.sub || req.user.id || req.user._id?.toString();
        const commentData = { ...req.body, userId: userId };
        const result = await commentCollection.insertOne(commentData);

        await activitiesCollection.insertOne({
          userId: userId,
          action: "Posted a new comment",
          details: { text: req.body.text },
          timestamp: new Date(),
        });

        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to create comment" });
      }
    });

    app.patch("/api/comments/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user.sub || req.user.id || req.user._id?.toString();
        const updatedData = req.body;

        const result = await commentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { text: updatedData.text, time: updatedData.time } },
        );

        await activitiesCollection.insertOne({
          userId: userId,
          action: "Updated a comment",
          details: { text: updatedData.text },
          timestamp: new Date(),
        });

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to update comment" });
      }
    });

    app.delete("/api/comments/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user.sub || req.user.id || req.user._id?.toString();

        const commentToDelete = await commentCollection.findOne({
          _id: new ObjectId(id),
        });
        const result = await commentCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount > 0) {
          await activitiesCollection.insertOne({
            userId: userId,
            action: "Deleted a comment",
            details: { text: commentToDelete?.text || "Unknown comment" },
            timestamp: new Date(),
          });
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to delete comment" });
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("Database connection failed:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running and Database is ready!");
});

app.listen(PORT, () => {
  console.log(`Server is running on Port ${PORT}`);
});
