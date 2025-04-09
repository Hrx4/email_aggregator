const axios = require("axios");
const dotenv = require('dotenv');

dotenv.config()
  
 const  triggerWebhook= async (email) => {
  try {
    console.log(email);
    const message = `New interested email received\n subject: ${email.subject}\n body:${email.body}\n `;
    await axios.post(
      process.env.WEBHOOK_URL,
      { text: message },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("Webhook triggered!");
  } catch (error) {
    console.error("Webhook Error:", error);
  }
}

module.exports = { triggerWebhook };
