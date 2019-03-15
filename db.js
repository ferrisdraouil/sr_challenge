const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql:///sportradar_challenge"
});

client.connect();

module.exports = client;