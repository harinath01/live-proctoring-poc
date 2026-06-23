const express = require("express");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = express();

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/", (_request, response) => {
  response.json({
    service: "mediasoup-server",
    status: "ready",
    message: "Placeholder HTTP service for future mediasoup APIs"
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(port, host, () => {
  console.log(`mediasoup-server listening on http://${host}:${port}`);
});
