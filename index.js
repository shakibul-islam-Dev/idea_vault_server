require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.path}`);
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

// MiddleWare for Authentication
// MiddleWare for Authentication
const verifyToken = async (req, res, next) => {
  // ১. হেডার থেকে টোকেন চেক
  let token = req?.headers?.authorization?.split(" ")[1];

  // ২. কুকি থেকে টোকেন চেক
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {});

    token =
      cookies["better-auth.session_token"] ||
      cookies["__Secure-better-auth.session_token"];
  }

  // যদি টোকেন না পাওয়া যায়
  if (!token || token === "undefined") {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    // ৩. JWT ভেরিফিকেশন
    const verified = await jwtVerify(token, JWKS);
    req.user = verified.payload;
    next();
  } catch (jwtError) {
    // যদি JWT ভেরিফিকেশন ফেল করে, Better Auth-এর সেশন এন্ডপয়েন্ট চেক করুন
    try {
      const authResponse = await fetch(
        `${process.env.CLIENT_URL}/api/auth/get-session`,
        {
          headers: {
            // কুকি হেডারটি স্পষ্টভাবে পাঠান
            Cookie: req.headers.cookie || "",
          },
        },
      );

      if (!authResponse.ok) throw new Error("Auth endpoint request failed");

      const sessionData = await authResponse.json();

      if (sessionData && sessionData.user) {
        req.user = sessionData.user;
        next();
      } else {
        throw new Error("Session invalid");
      }
    } catch (sessionError) {
      console.error("Authentication failed:", sessionError.message);
      return res.status(403).json({
        message: "Invalid Token or Session",
        error: sessionError.message,
      });
    }
  }
};

// MONGO CONNECTION & ROUTES
async function run() {
  try {
    await client.connect();

    const db = client.db("IdeaVault");
    const dataBaseCollection = db.collection("IdeaVaults");
    const bookingCollection = db.collection("bookings");
    const commentCollection = db.collection("comments");
    const activitiesCollection = db.collection("activities"); // নতুন কালেকশন

    // ==========================================
    // IDEA ROUTES
    // ==========================================

    app.post("/api/idea", async (req, res) => {
      try {
        const newIdea = req.body;

        const userId = req.user?.sub || req.user?.id || "unknown";

        const result = await dataBaseCollection.insertOne({
          ...newIdea,
          userId: userId,
          createdAt: new Date(),
        });
        res.status(201).json(result);
      } catch (error) {
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

    // ৩. নির্দিষ্ট একটি আইডিয়া গেট করার রাউট (GET)
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

    // ৪. নির্দিষ্ট আইডিয়া আপডেট করার রাউট (PATCH)
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

    // ৫. নির্দিষ্ট আইডিয়া ডিলিট করার রাউট (DELETE)
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
    // ACTIVITY ROUTES (From actions.js)
    // ==========================================

    // ইউজারের অ্যাক্টিভিটি লগ করা (POST)
    app.get("/api/activity", verifyToken, async (req, res) => {
      try {
        const userId = req.user.sub || req.user.id;
        // শুধুমাত্র ঐ ইউজারের অ্যাক্টিভিটিগুলো নিয়ে আসছে
        const result = await activitiesCollection
          .find({ userId: userId })
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Fetch activities error:", error);
        res.status(500).json({ error: "Failed to fetch activities" });
      }
    });

    // ইউজারের অ্যাক্টিভিটি ডিলিট করা (DELETE)
    app.delete("/api/activity/:id", async (req, res) => {
      try {
        const activityId = req.params.id;
        const userId = req.user.sub || req.user.id;

        if (!ObjectId.isValid(activityId))
          return res.status(400).json({ error: "Invalid ID format" });

        const result = await activitiesCollection.deleteOne({
          _id: new ObjectId(activityId),
          userId: userId, // শুধুমাত্র ওই ইউজারই ডিলিট করতে পারবে
        });

        res.json(result);
      } catch (error) {
        console.error("Error deleting activity:", error);
        res.status(500).json({ error: "Failed to delete activity" });
      }
    });

    // ==========================================
    // BOOKING ROUTES (Fixed Conflict)
    // ==========================================

    // বুকিং গেট করার রাউট
    app.get("/api/bookings", async (req, res) => {
      try {
        const result = await bookingCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bookings" });
      }
    });

    // বুকিং তৈরি করার রাউট
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

    // (আপনার আগের কমেন্ট রুটগুলো অপরিবর্তিত আছে)
    // ==========================================
    // COMMENT ROUTES (Updated with Activity Logging)
    // ==========================================

    app.get("/api/comments", async (req, res) => {
      try {
        const result = await commentCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch comments" });
      }
    });

    // ১. Post Comment & Log Activity
    app.post("/api/comments", verifyToken, async (req, res) => {
      try {
        const userId = req.user.sub || req.user.id;
        const commentData = {
          ...req.body,
          userId: userId,
        };
        const result = await commentCollection.insertOne(commentData);

        // 📝 Activity Log তৈরি করা হচ্ছে
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

    // ২. Update Comment & Log Activity
    app.patch("/api/comments/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user.sub || req.user.id;
        const updatedData = req.body;

        const result = await commentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { text: updatedData.text, time: updatedData.time } },
        );

        // 📝 Activity Log তৈরি করা হচ্ছে
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

    // ৩. Delete Comment & Log Activity
    app.delete("/api/comments/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user.sub || req.user.id;

        // ডিলিট করার আগে কমেন্টটি খুঁজে বের করছি যেন অ্যাক্টিভিটিতে টেক্সটটি দেখানো যায় (ঐচ্ছিক)
        const commentToDelete = await commentCollection.findOne({
          _id: new ObjectId(id),
        });

        const result = await commentCollection.deleteOne({
          _id: new ObjectId(id),
        });

        // 📝 Activity Log তৈরি করা হচ্ছে
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
