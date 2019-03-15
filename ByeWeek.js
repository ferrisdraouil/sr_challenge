const axios = require('axios');
const db = require('./db');
const BASE_URL = 'https://api.ngs.nfl.com/league/schedule';

class ByeWeek {
  static async loadSeasonData(year, type) {
    try {
      const seasonData = await axios.get(
        `${BASE_URL}/?season=${year}&seasonType=${type}`
      );

      // Probably unnecessary as API already returns sorted data by date,
      // however, could prevent mishaps in the future for the cost
      // of O(n(log(n))) time
      seasonData.sort((gameA, gameB) => gameA.week - gameB.week)

      // Not the most efficient, but works around problem of
      // Chargers and Rams moving and having new abbreviations
      const teams = new Set();
      for (let game of seasonData) {
        teams.add(game.homeTeamAbbr);
      }

      await this.populateFullYears(seasonData, year, type);
      await this.populateByeWeeks(seasonData, year, teams);
    } catch (error) {
      throw new Error('ERROR', error);
    }
  }

  static async populateFullYears(seasonData, year, type) {
    try {
      const existingFullSeason = await db.query(
        `SELECT * FROM full_years WHERE year_id=$1 AND season_type=$2`,
        [year, type]
      );
      if (!existingFullSeason.rows.length) {
        await db.query(
          `INSERT INTO full_years (year_id, season_type) VALUES ($1, $2)`,
          [year, type]
        );
      }
    } catch (error) {
      throw new Error('ERROR', error);
    }
  }

  static async populateByeWeeks(seasonData, year, teams) {
    try {

      

      let teamsNotPlayingThisWeek = new Set(teams);
      let week = 1;
      let teamsThatHaveHadBye = new Set()
      let teamsPointsAfterBye = {}
      let byeId

      for (let i = 0; i < seasonData.length; i++) {
        const game = seasonData[i];
        const nextGame = seasonData[i + 1];
        const { homeTeamAbbr, visitorTeamAbbr } = game

        teamsNotPlayingThisWeek.delete(homeTeamAbbr);
        teamsNotPlayingThisWeek.delete(visitorTeamAbbr);

        // Duplication --> Refactor
        if (teamsThatHaveHadBye.has(homeTeamAbbr)) {
          this.updatePointsAfterBye(teamsPointsAfterBye, homeTeamAbbr, 'home', game)
        }
        if (teamsThatHaveHadBye.has(visitorTeamAbbr)) {
          this.updatePointsAfterBye(teamsPointsAfterBye, visitorTeamAbbr, 'away', game)
        }

        if (week !== nextGame.week || !nextGame) {
          for (let team of teamsNotPlayingThisWeek) {
            teamsThatHaveHadBye.add(team)
            byeId = await db.query(
              `INSERT INTO bye_weeks (week, team_id, season) VALUES ($1, $2, $3) RETURNING id`,
              [week, team, year]
            );
            await db.query(
              `INSERT INTO points_after_bye (bye_week) VALUES ($1)`,
              [byeId.rows[0]]
            );
          }
          week = game.week;
          teamsNotPlayingThisWeek = new Set(teams);
        }
      }

      await this.turnTotalsIntoAverages(teamsPointsAfterBye, year)

    } catch (error) {
      throw new Error('ERROR', error);
    }
  }

  static async turnTotalsIntoAverages(pointObj, year) {
    for (let team in pointObj) {
      for (let pointSum in pointObj[team]) {
        if (pointSum === 'pointOT') {
          pointObj[team][pointSum] = pointObj[team][pointSum] / pointObj[team].otGames
        } else if (pointSum !== 'totalGames' && pointSum !== 'otGames') {
          pointObj[team][pointSum] = pointObj[team][pointSum] / pointObj[team].totalGames
        }
      }
      const byeId = await db.query(`SELECT id 
                              FROM bye_weeks 
                              JOIN teams ON bye_weeks.team_id = teams.id
                              WHERE season=$1 AND name=$2`, [year, team])
      const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = pointObj[team]
      await db.query(`INSERT INTO points_after_bye (bye_week_id, total_avg, first_quarter, second_quarter, third_quarter, fourth_quarter, overtime)
                      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [byeId.rows[0], pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT])
    }
  }

  static updatePointsAfterBye(totalPointsObj, teamAbbr, location, game) {
    const homeOrAway = location === 'home' ? 'homeTeamScore' : 'visitorTeamScore'
    if (!totalPointsObj[teamAbbr]) {
      totalPointsObj[teamAbbr] = { ...game.score[homeOrAway], totalGames: 1, otGames: 0 }
      delete totalPointsObj[teamAbbr].timeoutsRemaining
    } else {
      // Extra step just to be clear and explicit
      const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = game.score[homeOrAway]
      const gameScoreObj = { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT }
      
      for (let key in gameScoreObj) {
        totalPointsObj[teamAbbr][key] += gameScoreObj[key]
      }
    }
    totalPointsObj[teamAbbr].totalGames++
    if (game.score.phase === 'FINAL_OVERTIME') totalPointsObj[teamAbbr].otGames++
  }
}

module.exports = ByeWeek;
