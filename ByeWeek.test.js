const BASE_URL = 'https://api.ngs.nfl.com/league/schedule';
const ByeWeek = require('./ByeWeek')
const db = require('./db');
const request = require("supertest");
const app = require("./app")


let gameData
let balHomeGames
let emptyPointsObj = {}

beforeEach(async () => {
  gameData = await ByeWeek.callAPI(BASE_URL, 2018, 'REG');
  balHomeGames = gameData.data.filter(game => game.homeTeamAbbr === 'BAL')
});

describe("callAPI", function() {
  test('it should have 256 games', async function() {
    const teams = new Set();
    for (let game of gameData.data) {
      teams.add(game.homeTeamAbbr);
    }
    await ByeWeek.calculatePostByePointTotals(gameData.data, teams, 2018)
    expect(gameData.status).toBe(200)
    expect(gameData.data.length).toBe(256)
  })
})

describe("updatePointsAfterBye", function() {
  test('it should correctly update empty object', function() {
    expect(gameData.status).toBe(200)
    expect(gameData.data.length).toBe(256)
    ByeWeek.updatePointsAfterBye(emptyPointsObj, 'BAL', 'home', balHomeGames[0])
    expect(Object.keys(emptyPointsObj).length).toBe(1)
    expect(Object.keys(emptyPointsObj)[0]).toEqual('BAL')
    expect(Object.keys(emptyPointsObj['BAL']).length).toEqual(8)
    expect(emptyPointsObj['BAL'].pointQ2).toEqual(12)
    expect(emptyPointsObj['BAL'].totalGames).toEqual(1)
    expect(emptyPointsObj['BAL'].otGames).toEqual(0)
  })
  
  test("it should correctly update additional games", async function() {
    let secondQuarterSumAfterTwoGames = balHomeGames[0].score.homeTeamScore.pointQ2 + balHomeGames[1].score.homeTeamScore.pointQ2
    ByeWeek.updatePointsAfterBye(emptyPointsObj, 'BAL', 'home', balHomeGames[1])
    await ByeWeek.loadSeasonData(2014, 'REG')
    expect(emptyPointsObj['BAL'].otGames).toEqual(0)
    expect(emptyPointsObj['BAL'].pointQ2).toEqual(secondQuarterSumAfterTwoGames)
  })
})

describe("GET /byeweek", function () {
  test("Returns correct data", async function () {
    const philadelphia = await request(app).get('/byeweek/PHI/2018');
    const carolina = await request(app).get('/byeweek/CAR/2018');
    expect(philadelphia.statusCode).toBe(200);
    expect(philadelphia.body[0].week).toBe(9);
    expect(carolina.statusCode).toBe(200);
    expect(carolina.body[0].week).toBe(4);
  });
});

describe("GET /postbyeaverages", function () {
  test("Returns correct data without passing period", async function () {
    const philadelphia = await request(app).get('/postbyeaverages/PHI/2018');
    const carolina = await request(app).get('/postbyeaverages/CAR/2018');
    expect(philadelphia.statusCode).toBe(200);
    expect(philadelphia.body[0].total_avg).toBe(23.63);
    expect(carolina.statusCode).toBe(200);
    expect(carolina.body[0].total_avg).toBe(23.46);
  });

  test("Returns correct data when passing period", async function () {
    const philadelphia = await request(app).get('/postbyeaverages/PHI/2018/first_quarter');
    const carolina = await request(app).get('/postbyeaverages/CAR/2018/first_quarter');
    expect(philadelphia.statusCode).toBe(200);
    expect(philadelphia.body[0].first_quarter).toBe(2.5);
    expect(carolina.statusCode).toBe(200);
    expect(carolina.body[0].first_quarter).toBe(6.62);
  });
});



afterAll(async function () {
  try {
    await db.end();
  } catch (error) {
    console.error(error)
  }
});