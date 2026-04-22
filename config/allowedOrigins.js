const allowedOrigins = [
  "http://localhost:8080",
  "https://learningmanagementt.netlify.app", // Keep old one just in case
];

// Dynamically add the frontend URL from environment variables
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

module.exports = allowedOrigins;
