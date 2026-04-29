const app = require("./app");
const mongoose = require("mongoose");
const { logEvents } = require("./middleware/logger");
const PORT = process.env.PORT || 5001;

const { CronJob } = require('cron');
const https = require('https');
const http = require('http');

// Keep-alive cron job: runs every 14 minutes to prevent Render from sleeping
const job = new CronJob('*/14 * * * *', function () {
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    console.log(`Pinging ${backendUrl} to keep awake...`);
    const protocol = backendUrl.startsWith('https') ? https : http;
    protocol.get(backendUrl, (res) => {
      console.log(`Keep-alive ping status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('Keep-alive ping error:', err.message);
    });
  }
});

mongoose.connection.once("open", () => {
  console.log("connected to MongoDB");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    job.start(); // Start the cron job when the server starts
  });
});
mongoose.connection.on("error", (err) => {
  console.log(err);
  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log",
  );
});
