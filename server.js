const express = require("express");
const { startEmailWatcher } = require("./imapManager");
const { client } = require("./elasticsearch");
const { giveDetails, embeddings, suggetionPromt } = require("./gemini");
const { triggerWebhook } = require("./slack");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const corsOptions = {
  origin: ["http://localhost:5173", "https://outboxassignment.netlify.app"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

dotenv.config();

app.get("/", async (req, res) => {
  res.send("working....");
});

app.post("/category", async (req, res) => {
  try {
    const { email } = req.body;
    const result = await giveDetails(email);
    if (result === "Error") {
      res.status(500).json({ error: "Failed to classify" });
      return;
    }
    if (result === "Interested\n") {
      await triggerWebhook(email);
    }
    console.log(result);
    res.status(200).json({ category: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/search", async (req, res) => {
  try {
    const { userEmail, folder, query } = req.body;

    console.log(userEmail, folder);
    if (!userEmail || !folder) {
      res.status(400).json({ error: "Missing parameters" });
      return;
    }
    const filterArray = [{ term: { "folder.keyword": `${folder}` } }];
    if (userEmail !== "All") {
      filterArray.push({ term: { "account.keyword": `${userEmail}` } });
    }
    let boolObj = {
      filter: filterArray,
    };
    if (query.length > 0) {
      boolObj = {
        ...boolObj,
        must: [
          {
            multi_match: {
              query: query,
              fields: ["subject", "body"],
            },
          },
        ],
      };
    }
    const result = await client.search({
      index: "emails",
      body: {
        query: {
          bool: boolObj,
        },
      },
    });

    if (result.hits.hits.length === 0) {
      res.status(404).json({ error: result });
      return;
    }
    res.status(200).json(result.hits.hits);
  } catch (error) {
    console.log(
      process.env.ES_ID,
      process.env.ES_USERNAME,
      process.env.ES_PASSWORD
    );
    res.status(500).json({ error: error.message });
  }
});

app.post("/train", async (req, res) => {
  const { query } = req.body;

  const embedding = await embeddings(query);
  console.log(embedding);

  try {
    const result = await client.index({
      index: "suggetions",
      document: {
        query,
        embeddings: embedding,
      },
    });

    res.status(200).json(result._id);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const retriveContext = async (query) => {
  try {
    console.log(query);
    const query_embeddings = await embeddings(query);
    const context = await client.search({
      index: "suggetions",
      body: {
        query: {
          knn: {
            field: "embeddings",
            k: 3,
            query_vector: query_embeddings,
            num_candidates: 10,
          },
        },
      },
    });

    return context;
  } catch (err) {
    console.log(err);
    return err;
  }
};

app.post("/searchContext", async (req, res) => {
  const { query } = req.body;
  const retrivedContext = await retriveContext(query);
  try {
    const result = await suggetionPromt(retrivedContext.hits.hits, query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, async () => {
  await startEmailWatcher();

  console.log("Server running on port 5000");
});
