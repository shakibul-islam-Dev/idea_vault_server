require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 4000;

// ডাবল ডিক্লেয়ারেশন ফিক্স করা হলো (এক লাইনে নিয়ে আসা হয়েছে)
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log("Verified User:", payload);

    req.user = payload; // ইউজারের ডাটা রিকোয়েস্টে সেট করা হলো যেন পরের ফাংশনে ইউজ করা যায়
    next();
  } catch (error) {
    console.error("Token Error:", error.message);
    return res.status(403).json({ message: "Invalid or Expired Token" });
  }
};

async function run() {
  try {
    // await client.connect();

    const db = client.db("IdeaVault");
    const dataBaseCollection = db.collection("IdeaVaults");
    const bookingCollection = db.collection("bookings");

    // ১. তৈরি করার রাউট
    app.post("/api/idea", async (req, res) => {
      const newIdea = req.body;
      const result = await dataBaseCollection.insertOne(newIdea);
      res.json(result);
    });

    // ২. সব আইডিয়া গেট করার রাউট
    app.get("/api/idea", async (req, res) => {
      try {
        const result = await dataBaseCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch ideas" });
      }
    });

    // ৩. নির্দিষ্ট একটি আইডিয়া গেট করার রাউট (টোকেন ভেরিফাইড)
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

    // ৪. বুকিং গেট করার রাউট (টোকেন ভেরিফাইড)
    app.get("/api/ideadetails", verifyToken, async (req, res) => {
      try {
        const result = await bookingCollection.find({}).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bookings" });
      }
    });

    // ৫. বুকিং তৈরি করার রাউট
    app.post("/api/ideadetails", async (req, res) => {
      try {
        const bookingData = req.body;
        const result = await bookingCollection.insertOne(bookingData);
        res.status(201).json(result);
      } catch (error) {
        console.error("Backend error inserting booking:", error);
        res.status(500).json({ error: "Failed to create booking" });
      }
    });

    // await client.db("admin").command({ ping: 1 });
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
