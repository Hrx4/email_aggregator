const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { client } = require("./elasticsearch");
const { giveDetails } = require("./gemini");
const { triggerWebhook } = require("./slack");
const dotenv = require("dotenv");

dotenv.config();
const emailAccounts = [
  {
    user: "dragkamal71@gmail.com",
    password: process.env.FIRST_MAIL_PASSWORD,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  },
  {
    user: "kpal0322@gmail.com",
    password: process.env.SECOND_MAIL_PASSWORD,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  },
];
const FOLDERS = ["INBOX", "[Gmail]/Sent Mail", "[Gmail]/Spam"];

function getLast30DaysDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date
    .toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(",", "");
}

function connectIMAP(account) {
  return new Promise((resolve, reject) => {
    const imap = new Imap(account);

    imap.once("ready", () => {
      console.log(`IMAP connection established for ${account.user}`);
      resolve(imap);
    });

    imap.once("error", (err) =>
      reject(`IMAP Connection Error for ${account.user}: ${err.message}`)
    );
    imap.once("end", () =>
      console.log(`IMAP Connection ended for ${account.user}`)
    );

    imap.connect();
  });
}

function fetchEmailsFromFolder(imap, folder, sinceDate) {
  return new Promise((resolve, reject) => {
    imap.openBox(folder, true, (err) => {
      if (err) return reject(`Error opening folder ${folder}: ${err.message}`);

      imap.search([["SINCE", sinceDate]], (err, results) => {
        if (err || !results.length) return resolve([]);

        const f = imap.fetch(results, { bodies: "", struct: true });
        let emails = [];

        f.on("message", (msg) => {
          let emailData = "";
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => (emailData += chunk.toString("utf8")));
          });

          msg.on("end", async () => {
            try {
              const parsed = await simpleParser(emailData);
              const emailObj = {
                messageId: parsed.messageId,
                account: parsed.to.value[0].address,
                folder,
                subject: parsed.subject,
                sender: parsed.from.value[0].address,
                body: parsed.text,
                receivedAt: parsed.date,
              };
              await storeEmail(emailObj);
              emails.push(emailObj);
            } catch (parseErr) {
              console.error(`Parsing error: ${parseErr.message}`);
            }
          });
        });

        f.once("end", () => resolve(emails));
        f.once("error", (err) =>
          reject(`Fetch error in ${folder}: ${err.message}`)
        );
      });
    });
  });
}

async function startEmailWatcher() {
  const sinceDate = getLast30DaysDate();
  for (const account of emailAccounts) {
    try {
      const imap = await connectIMAP(account);
      for (const folder of FOLDERS) {
        await fetchEmailsFromFolder(imap, folder, sinceDate);
      }
      watchForNewEmails(imap);
    } catch (error) {
      console.error("Error:", error);
    }
  }
}

function watchForNewEmails(imap) {
  imap.openBox("INBOX", true, (err) => {
    if (err) throw err;
    console.log("Watching for new emails...");

    imap.on("mail", async () => {
      console.log("New email detected!");
      await fetchLatestEmail(imap);
    });
  });
}

async function fetchLatestEmail(imap) {
  return new Promise((resolve, reject) => {
    imap.search(["ALL"], (err, results) => {
      if (err || !results.length) return reject("No emails found.");

      const latestEmailUID = results[results.length - 1];
      const f = imap.fetch(latestEmailUID, { bodies: "", struct: true });
      let emailData = "";

      f.on("message", (msg) => {
        msg.on("body", (stream) => {
          stream.on("data", (chunk) => (emailData += chunk.toString("utf8")));
        });

        msg.on("end", async () => {
          try {
            const parsed = await simpleParser(emailData);
            const emailObj = {
              messageId: parsed.messageId,
              account: parsed.to.value[0].address,
              folder: "INBOX",
              subject: parsed.subject,
              sender: parsed.from.value[0].address,
              body: parsed.text,
              receivedAt: parsed.date,
            };
            await storeEmail(emailObj);
            const res = await giveDetails({
              subject: parsed.subject,
              body: parsed.text,
            });
            if (res === "Interested\n") {
              await triggerWebhook(emailObj);
            }
            resolve(parsed);
          } catch (parseErr) {
            reject(`Parsing error: ${parseErr.message}`);
          }
        });
      });

      f.once("error", (err) => reject(`Fetch error: ${err.message}`));
    });
  });
}

async function storeEmail(emailData) {
  try {
    await client.index({
      index: "emails",
      id: emailData.messageId,
      document: emailData,
    });
  } catch (err) {
    console.error(" Error storing email in Elasticsearch:", err.message);
  }
}

module.exports = { startEmailWatcher };
