const express = require("express");
const cors = require("cors");
const ByeWeek = require("./ByeWeek");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/byeweek/:teamHandle/:year", async function(req, res, next) {
  try {
    const { teamHandle, year } = req.params
    const byeWeek = await ByeWeek.findByeWeek(teamHandle, year, 'REG');
    return res.json(byeWeek);
  } catch (e) {
    return new Error(e);
  }
});

app.get("/postbyeaverages/:teamHandle/:year/:period?", async function(req, res, next) {
  try {
    const { teamHandle, year, period } = req.params
    const byeWeek = await ByeWeek.findPostByeAverageScores(teamHandle, year, period);
    return res.json(byeWeek);
  } catch (e) {
    return new Error(e);
  }
});

module.exports = app;
