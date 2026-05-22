require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;
app.use(express.json());
//CORS
app.use(corscors());
// JWT
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// JWK Token
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);
//MiddleWare
const verifyToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const verified = await jwtVerify(token, JWKS);
    console.log("Verified User:", verified);

    req.user = verified;
    next();
  } catch (error) {
    console.error("Token Error:", error.message);
    return res.status(403).json({ message: "Invalid or Expired Token" });
  }
};
// MONGO CONNECTION
async function run() {
  try {
    // await client.connect();

    const db = client.db("IdeaVault");
    const dataBaseCollection = db.collection("IdeaVaults");
    const bookingCollection = db.collection("bookings");
    const commentCollection = db.collection("comments");

    // ==========================================
    // IDEA ROUTES
    // ==========================================

    // ১. তৈরি করার রাউট (POST)
    app.post("/api/idea", async (req, res) => {
      try {
        const newIdea = req.body;

        const result = await dataBaseCollection.insertOne({
          ...newIdea,
          createdAt: new Date(),
        });
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to create idea" });
      }
    });

    // ২. সব আইডিয়া গেট করার রাউট (GET)
    app.get("/api/idea", async (req, res) => {
      try {
        const category = req.query.category || "";
        const search = req.query.search || "";

        let query = {};

        // ক্যাটাগরি ফিল্টার লজিক
        if (category && category !== "All") {
          query.category = category;
        }

        // সার্চ ফিল্টার লজিক
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { ideaTitle: { $regex: search, $options: "i" } },
            { tags: { $regex: search, $options: "i" } },
          ];
        }

        const result = await dataBaseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        console.error("Fetch ideas error:", error);
        res.status(500).json({ error: "Failed to fetch ideas" });
      }
    });

    // ৩. নির্দিষ্ট একটি আইডিয়া গেট করার রাউট (GET with Token)
    app.get("/api/idea/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await dataBaseCollection.findOne(query);

        if (!result) {
          return res.status(404).json({ error: "Idea not found" });
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // ৪. নির্দিষ্ট আইডিয়া আপডেট করার রাউট (PATCH)
    app.patch("/api/idea/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        const updateDoc = {
          $set: {
            title: updatedData.title,
            ideaTitle: updatedData.ideaTitle,
            shortDesc: updatedData.shortDesc,
            detailedDesc: updatedData.detailedDesc,
            problemStatement: updatedData.problemStatement,
            proposedSolution: updatedData.proposedSolution,
            category: updatedData.category,
            budget: updatedData.budget,
            imageUrl: updatedData.imageUrl,
            date: updatedData.date,
            time: updatedData.time,
            tags: updatedData.tags,
          },
        };

        const result = await dataBaseCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Idea not found" });
        }
        res.json({ message: "Idea updated successfully", result });
      } catch (error) {
        console.error("Backend error updating idea:", error);
        res.status(500).json({ error: "Failed to update idea" });
      }
    });

    // ৫. নির্দিষ্ট আইডিয়া ডিলিট করার রাউট (DELETE)
    app.delete("/api/idea/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await dataBaseCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Idea not found" });
        }
        res.json({ message: "Idea deleted successfully", result });
      } catch (error) {
        console.error("Backend error deleting idea:", error);
        res.status(500).json({ error: "Failed to delete idea" });
      }
    });

    // ==========================================
    // BOOKING ROUTES
    // ==========================================

    // বুকিং গেট করার রাউট
    app.get("/api/idea", async (req, res) => {
      try {
        const result = await bookingCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bookings" });
      }
    });

    // বুকিং তৈরি করার রাউট
    app.post("/api/idea", async (req, res) => {
      try {
        const bookingData = req.body;
        const result = await bookingCollection.insertOne(bookingData);
        res.status(201).json(result);
      } catch (error) {
        console.error("Backend error inserting booking:", error);
        res.status(500).json({ error: "Failed to create booking" });
      }
    });

    // ==========================================
    // COMMENT ROUTES
    // ==========================================

    // কমেন্ট গেট করার রাউট
    app.get("/api/comments", async (req, res) => {
      try {
        const result = await commentCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch comments" });
      }
    });

    // কমেন্ট তৈরি করার রাউট
    app.post("/api/comments", async (req, res) => {
      try {
        const commentData = req.body;
        const result = await commentCollection.insertOne(commentData);
        res.status(201).json(result);
      } catch (error) {
        console.error("Backend error inserting commentData:", error);
        res.status(500).json({ error: "Failed to create commentData" });
      }
    });

    // কমেন্ট আপডেট করার রাউট
    app.patch("/api/comments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        const updateDoc = {
          $set: {
            text: updatedData.text,
            time: updatedData.time,
          },
        };

        const result = await commentCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Comment not found" });
        }
        res.json(result);
      } catch (error) {
        console.error("Backend error updating comment:", error);
        res.status(500).json({ error: "Failed to update comment" });
      }
    });

    // কমেন্ট ডিলিট করার রাউট
    app.delete("/api/comments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await commentCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Comment not found" });
        }
        res.json(result);
      } catch (error) {
        console.error("Backend error deleting comment:", error);
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
