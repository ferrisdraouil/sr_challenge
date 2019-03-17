const ByeWeek = require('./ByeWeek');
const db = require('./db');

// Note: Before 2014, this API didnt have game scores

(function seedDatabase() {
  // Speed improvement using Promise.all instead of async/await
  const years = [2014, 2015, 2016, 2017, 2018];
  const promiseArr = [];

  for (const year of years) {
    promiseArr.push(ByeWeek.loadSeasonData(year, 'REG'));
  }

  Promise.all(promiseArr).then(() => db.end());
})();
