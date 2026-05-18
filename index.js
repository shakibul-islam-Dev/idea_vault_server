require("dotenv").config();
const express = require("express");
const app = express();
const mongoUri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 4000;

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
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    await client.close();
  }
}
run().catch(console.dir);

app.listen("PORT", () => {
  console.log(`Server is running on Port ${PORT}`);
});
