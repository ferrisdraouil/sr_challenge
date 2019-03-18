const axios = require('axios');
const db = require('./db');
const BASE_URL = 'https://api.ngs.nfl.com/league/schedule';

class ByeWeek {
  static async findByeWeek(teamHandle, year, seasonType) {
    const result = await db.query(`SELECT bye_weeks.week FROM bye_weeks
                                    JOIN teams 
                                      ON teams.id = bye_weeks.team_id
                                    JOIN seasons 
                                      ON seasons.id = bye_weeks.season_id
                                    JOIN full_years
                                      ON seasons.id = full_years.year_id
                                    JOIN season_types
                                      ON full_years.season_type_id = season_types.id
                                    WHERE teams.name = $1 
                                      AND season_types.type = $2
                                      AND seasons.season_year = $3`, [teamHandle, seasonType, year])
    if (result.rows.length === 0) {
      let notFound = new Error(`No entry for '${teamHandle}' '${year}' '${seasonType}'`);
      notFound.status = 404;
      return notFound;
    }

    return result.rows
  }

  static async findPostByeAverageScores(teamHandle, year, period='total_avg') {
    const result = await db.query(`SELECT points_after_bye.${period} FROM points_after_bye
                                    JOIN bye_weeks
                                      ON bye_weeks.id = points_after_bye.bye_week_id
                                    JOIN teams
                                      ON teams.id = bye_weeks.team_id
                                    JOIN seasons
                                      ON seasons.id = bye_weeks.season_id
                                    WHERE seasons.season_year = $1
                                      AND teams.name = $2`, [year, teamHandle])

    if (result.rows.length === 0) {
      let notFound = new Error(`No entry for '${teamHandle}' '${year}' '${period}'`);
      notFound.status = 404;
      throw notFound;
    }

    return result.rows
  }

  static async loadSeasonData(year, type) {
    try {
      let seasonData = await this.callAPI(BASE_URL, year, type)
      seasonData = seasonData.data

      // Data seems to come back orderd by date, but sort just in case
      // that changes in the future, or there's an unexpected bug
      seasonData.sort((gameA, gameB) => gameA.week - gameB.week)

      // Works around problem of Chargers and Rams
      // moving and having new abbreviations
      const teams = new Set();
      for (let game of seasonData) {
        teams.add(game.homeTeamAbbr);
      }

      await this.populateFullYears(year, type);
      await this.calculateByeWeekStats(seasonData, year, teams);
    } catch (error) {
      console.error('LOAD SEASON DATA ERROR', error);
    }
  }

  static async populateFullYears(year, type) {
    try {
      // Check if year exists in seasons table
      let existingYear = await db.query(`SELECT id FROM seasons WHERE season_year=$1`, [year])
      const typeId = await db.query(`SELECT id FROM season_types WHERE type=$1`, [type])

      // If not, grab ID
      if (existingYear.rows.length === 0) {
        existingYear = await db.query(
          `INSERT INTO seasons (season_year) VALUES ($1) RETURNING id`,
          [year]
        );
      }      
      
      
      // See if year/type combo exists in full_years table
      const existingFullSeason = await db.query(
        `SELECT * FROM full_years WHERE year_id=$1 AND season_type_id=$2`,
        [existingYear.rows[0].id, typeId.rows[0].id]
      );

      // If not, update table
      if (existingFullSeason.rows.length === 0) {
        await db.query(
          `INSERT INTO full_years (year_id, season_type_id) VALUES ($1, $2)`,
          [existingYear.rows[0].id, typeId.rows[0].id]
        );
      }
    } catch (error) {
      console.error('POPULATE FULL YEARS ERROR', error);
    }
  }

  static async calculateByeWeekStats(seasonData, year, teams) {
    try {
      const teamsPointsAfterBye = await this.calculatePostByePointTotals(seasonData, teams, year)

      await this.turnTotalsIntoAverages(teamsPointsAfterBye, year)

    } catch (error) {
      console.error('CALCULATE BYE WEEK TOTALS ERROR', error);
    }
  }

  static async calculatePostByePointTotals(seasonData, teams, year) {
    try {
      seasonData.sort((gameA, gameB) => gameA.week - gameB.week)

      // Final obj to be returned
      let teamsPointsAfterBye = {}

      // Copy teams -- these will be iteratively deleted game by game 
      // remainder will be bye week teams
      let teamsNotPlayingThisWeek = new Set([...teams]);
      let week = 1;
      let teamsThatHaveHadBye = new Set()
  
      for (let i = 0; i < seasonData.length; i++) {
        const currentGame = seasonData[i];
        const nextGame = seasonData[i + 1];
        const { homeTeamAbbr, visitorTeamAbbr } = currentGame
        
        teamsNotPlayingThisWeek.delete(homeTeamAbbr);
        teamsNotPlayingThisWeek.delete(visitorTeamAbbr);
        
        // Only update final Obj if teams have had bye
        if (teamsThatHaveHadBye.has(homeTeamAbbr)) {
          this.updatePointsAfterBye(teamsPointsAfterBye, homeTeamAbbr, 'home', currentGame)
        }
        if (teamsThatHaveHadBye.has(visitorTeamAbbr)) {
          this.updatePointsAfterBye(teamsPointsAfterBye, visitorTeamAbbr, 'away', currentGame)
        }

        // If last game of the week we add this week's bye teams
        // To cumulative list of teams that have had bye
        // Then reset the set of teams playing this week
        if (!nextGame || week !== nextGame.week) { 
          for (let team of teamsNotPlayingThisWeek) {
            teamsThatHaveHadBye.add(team)

            // While we have the week team and year information required
            // For bye_weeks table, we update it
            await this.updateByeWeeksTable(week, team, year)
          }
          if (nextGame) {
            week = nextGame.week;
          }
          teamsNotPlayingThisWeek = new Set([...teams]);
        }
      }
      
      return teamsPointsAfterBye
    } catch (error) {
      console.error('CALCULATE POST BYE POINT TOTALS ERROR', error);
    }
  }

  static async turnTotalsIntoAverages(pointObj, year) {
    try {
      for (let team in pointObj) {
        for (let pointSum in pointObj[team]) {
          if (pointSum === 'pointOT') {
            pointObj[team][pointSum] = (pointObj[team][pointSum] / pointObj[team].otGames)
          } else if (pointSum !== 'totalGames' && pointSum !== 'otGames') {
            pointObj[team][pointSum] = (pointObj[team][pointSum] / pointObj[team].totalGames)
          }
        } 
        await this.insertAveragesInDatabase(pointObj[team], year, team)
      }
    } catch (error) {
      console.error('TURN TOTALS INTO AVERAGES ERROR', error);
    }
  }

  static async insertAveragesInDatabase(teamsScoreObj, year, team) {
    try {
      const seasonId = await db.query(
        `SELECT id FROM seasons WHERE season_year=$1`,
        [year]
      ); 
      const byeId = await db.query(`SELECT bye_weeks.id 
                                    FROM bye_weeks 
                                    JOIN teams ON bye_weeks.team_id = teams.id
                                    WHERE season_id=$1 AND name=$2`, [seasonId.rows[0].id, team])
      
      for (let period in teamsScoreObj) {
        teamsScoreObj[period] = teamsScoreObj[period].toFixed(2)
      }
      const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = teamsScoreObj
      
      await db.query(`INSERT INTO points_after_bye (bye_week_id, total_avg, first_quarter, second_quarter, third_quarter, fourth_quarter, overtime)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [byeId.rows[0].id, pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT])
    } catch (error) {
      console.error('INSERT AVERAGES INTO DATABASE ERROR', error);
    }
  }

  static updatePointsAfterBye(totalPointsObj, teamAbbr, location, game) {
    const homeOrAway = location === 'home' ? 'homeTeamScore' : 'visitorTeamScore'
    if (!totalPointsObj[teamAbbr]) {
      totalPointsObj[teamAbbr] = { ...game.score[homeOrAway], totalGames: 0, otGames: 0 }
      delete totalPointsObj[teamAbbr].timeoutsRemaining
    } else {
      // Extra step just for clarity
      const { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT } = game.score[homeOrAway]
      const gameScoreObj = { pointTotal, pointQ1, pointQ2, pointQ3, pointQ4, pointOT }
      
      for (let key in gameScoreObj) {
        totalPointsObj[teamAbbr][key] += gameScoreObj[key]
      }
    }
    totalPointsObj[teamAbbr].totalGames++
    if (game.score.phase === 'FINAL_OVERTIME') totalPointsObj[teamAbbr].otGames++
  }

  static async updateByeWeeksTable(week, team, year) {
    try {
      const seasonId = await db.query(
        `SELECT id FROM seasons WHERE season_year=$1`,
        [year]
      );
        
      let teamId = await db.query(
        `SELECT id FROM teams WHERE name=$1`,
        [team]
      );
      
      // 2014 Jacksonville went by JAC
      // Rest of years as JAX
      if (teamId.rows.length === 0) {
        teamId = await db.query(`INSERT INTO teams (name) VALUES ($1) RETURNING id`, [team])
      }

      const existingByeInTable = await db.query(`SELECT * FROM bye_weeks WHERE week=$1 AND team_id=$2 AND season_id=$3`, [week, teamId.rows[0].id, seasonId.rows[0].id])
      
      if (existingByeInTable.rows.length === 0) {
        await db.query(
          `INSERT INTO bye_weeks (week, team_id, season_id) VALUES ($1, $2, $3) RETURNING id`,
          [week, teamId.rows[0].id, seasonId.rows[0].id]
        );
      }
    } catch (error) {
      console.error('UPDATE BYE WEEKS TABLE ERROR', error);
    }
  }

  static async callAPI(url, year, type) {
    try {
      const data = axios.get(
        `${url}/?season=${year}&seasonType=${type}`
      );
      return data
    } catch (error) {
      console.error('CALL API ERROR', error);
    }
  }
}

module.exports = ByeWeek;
