const ByeWeek = require('./ByeWeek')
const db = require('./db');

const years = [2014, 2015, 2016, 2017, 2018]
const promiseArr = []

function seedDatabase() {
  for (const year of years) {
    promiseArr.push(ByeWeek.loadSeasonData(year, 'REG'))
  }
  Promise.all(promiseArr).then(() => db.end())
}

seedDatabase()