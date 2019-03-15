const axios = require('axios');
const db = require('./db');
const BASE_URL = 'https://api.ngs.nfl.com/league/schedule';

class ByeWeek {
  static async loadSeasonData(year, type) {
    try {
      const seasonData = await axios.get(
        `${BASE_URL}/?season=${year}&seasonType=${type}`
      );

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

      // Probably unnecessary as API already returns sorted data by date,
      // however, could prevent mishaps in the future for the cost
      // of O(n(log(n))) time
      seasonData.sort((gameA, gameB) => gameA.week - gameB.week)

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
          if (!teamsPointsAfterBye[homeTeamAbbr]) {
            teamsPointsAfterBye[homeTeamAbbr] = { ...game.score.homeTeamScore, totalGames: 1, otGames: 0 }
            delete teamsPointsAfterBye[homeTeamAbbr].timeoutsRemaining
          } else {
            // Extra step just to be clear and explicit
            const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = game.score.homeTeamScore
            const gameScoreObj = { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT }
            
            for (let key in gameScoreObj) {
              teamsPointsAfterBye[homeTeamAbbr][key] += gameScoreObj[key]
            }
          }
          teamsPointsAfterBye[homeTeamAbbr].totalGames++
          if (game.score.phase === 'FINAL_OVERTIME') teamsPointsAfterBye[homeTeamAbbr].otGames++
        }
        if (teamsThatHaveHadBye.has(visitorTeamAbbr)) {
          if (!teamsPointsAfterBye[visitorTeamAbbr]) {
            teamsPointsAfterBye[visitorTeamAbbr] = { ...game.score.visitorTeamScore, totalGames: 1, otGames: 0 }
            delete teamsPointsAfterBye[visitorTeamAbbr].timeoutsRemaining
          } else {
            // Extra step just to be clear and explicit
            const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = game.score.visitorTeamScore
            const gameScoreObj = { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT }
            
            for (let key in gameScoreObj) {
              teamsPointsAfterBye[visitorTeamAbbr][key] += gameScoreObj[key]
            }
          }
          teamsPointsAfterBye[visitorTeamAbbr].totalGames++
          if (game.score.phase === 'FINAL_OVERTIME') teamsPointsAfterBye[visitorTeamAbbr].otGames++
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

      // Turn totals into averages
      for (let team in teamsPointsAfterBye) {
        for (let pointSum in teamsPointsAfterBye[team]) {
          if (pointSum === 'pointOT') {
            teamsPointsAfterBye[team][pointSum] = teamsPointsAfterBye[team][pointSum] / teamsPointsAfterBye[team].otGames
          } else if (pointSum !== 'totalGames' && pointSum !== 'otGames') {
            teamsPointsAfterBye[team][pointSum] = teamsPointsAfterBye[team][pointSum] / teamsPointsAfterBye[team].totalGames
          }
        }
        byeId = await db.query(`SELECT id 
                                FROM bye_weeks 
                                JOIN teams ON bye_weeks.team_id = teams.id
                                WHERE season=$1 AND name=$2`, [year, team])
        const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = teamsPointsAfterBye[team]
        await db.query(`INSERT INTO points_after_bye (bye_week_id, total_avg, first_quarter, second_quarter, third_quarter, fourth_quarter, overtime)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [byeId.rows[0], pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT])
      }


    } catch (error) {
      throw new Error('ERROR', error);
    }
  }
}

module.exports = ByeWeek;
