require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion } = require("mongodb");

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("IdeaVault");
    const dataBaseCollection = db.collection("IdeaVaults");
    app.post("/api/idea", async (req, res) => {
      const newIdea = req.body;
      const result = await dataBaseCollection.insertOne(newIdea);
      res.json(result);
    });

    app.get("/api/idea", async (req, res) => {
      const result = await dataBaseCollection.find({}).toArray();

      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    // Error console log kora lagbe jate bhul bujha jay
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
