const { Client } = require("@elastic/elasticsearch");
const dotenv = require('dotenv');

dotenv.config()
const client = new Client({
  cloud: {
    id: process.env.ES_ID,
  },
  auth:{
    username : process.env.ES_USERNAME,
    password : process.env.ES_PASSWORD
  },
  tls:{
    rejectUnauthorized: false 
  }
    });

    async function createIndex() {
      const index = "emails";
      const exists = await client.indices.exists({index });
    
      if (!exists) {
        await client.indices.create({
          index ,
          body: {
            mappings: {
              properties: { 
                messageId: {type:"text"},
                account: { type: "keyword" },
                folder: { type: "keyword" },
                subject: { type: "text" },
                sender: { type: "text" },  
                body: { type: "text" },
                receivedAt: { type: "date" },
                // category: { type: "keyword" }  // New field
              },
            },
          },
        });
        console.log(`Index '${index}' created`);
      }
      
    }
    async function createVectoredIndex() {
      const index = "suggetions";
      const exists = await client.indices.exists({index });
    
      if (!exists) {
        await client.indices.create({
          index ,
          body: {
            mappings: {
              properties: {
                "query":{
                  type: "text",
                },
                "embeddings":{
                  type : "dense_vector",
                  dims: 768,
                }
            },
          },
        }})
        console.log(`Index '${index}' created`);
      }
      
    }

    
    
    createIndex().catch(console.error);
    createVectoredIndex().catch(console.error);
    
     
module.exports= {client };
