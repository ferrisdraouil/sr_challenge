const express = require("express");
const cors = require("cors");
const ByeWeek = require("./ByeWeek");

const app = express();
app.use(cors());
app.use(express.json());

ByeWeek.loadSeasonData(2014, 'REG')