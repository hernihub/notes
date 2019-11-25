require('../code/utils');
const logger = require('../code/Logger');
const { Pool } = require('pg');

const rdsConfig = {
    host: process.env.RDS_HOSTNAME || 'localhost',
    database: process.env.RDS_DB_NAME || 'axtsrdevdb',
    port: process.env.RDS_PORT || '10200',
    ssl: true
};

/**
 * DAO class for CRUD operations on Admin Portal Agent, AgentSecurityProfile and AgentBusinessUnit tables. Query on BusinessUnit table.
 */
class PostgresClient {
    constructor(user, password){
        rdsConfig.user = user;
        rdsConfig.password = password;
        this.pool = new Pool(rdsConfig);
    }
    
    async query(params) {
        let selectPromise = new Promise((resolve,reject) => {
            this.pool.query(params, (err, res) => {
                if(err){
                    logger.error(`Error querying Admin Portal database with message: ${err.message}`, params);
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
        return selectPromise;
    }

    async getUserInfo(username) {
        const sql = `SELECT DISTINCT agsec.agentid, agsec.securityprofileid, agbu.businessunitid FROM agentsecurityprofile agsec
                     INNER JOIN agentbusinessunit agbu ON agsec.agentid = agbu.agentid
                     WHERE agsec.agentid = (SELECT id FROM agent WHERE username='${username}')`;
        try {
            const result = await this.query(sql);
            return result;
        } catch (error) {
            logger.error(`Error querying Admin Portal database with message: ${error.message} | Returning empty result set.`, username);
            const emptyResult = {rows : []};
            return emptyResult;
        }
    }

    async getBuinessUnitMapI() {
        let sql = "SELECT * FROM BusinessUnit";
        let selectPromise = new Promise((resolve,reject) => {
            this.pool.query(sql, (err, res) => {
                if(err){
                    logger.error(`Error querying Admin Portal BusinessUnit table with message: ${err.message}`);
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
        return selectPromise;
    }

    async getBuinessUnitMap() {
        const buMap = new Map();
        const businessUnits = await this.getBuinessUnitMapI();
        const rows = businessUnits.rows;
        rows.forEach((row) => {
            buMap.set(row.name, row.id);
        });
        return buMap;
    }
    
    /**
     * Updates the user security profiles and business units in DB
     * @param {*} username The username of the user, which is unique.
     */
    async updateUserSPandBU(user, agentid) {
        let deleteSQL = `DELETE FROM AgentSecurityProfile WHERE agentid = '${agentid}'`;
        await this.query(deleteSQL);
        
        deleteSQL = `DELETE FROM AgentBusinessUnit WHERE agentid = '${agentid}'`;
        await this.query(deleteSQL);
        
        await this.insertUserSP(user, agentid);
        
        return this.insertUserBU(user, agentid);
    }

    async insertUserSP(agent, agentid) {    
        let insertSQL = "INSERT INTO AgentSecurityProfile VALUES ($1, $2) RETURNING SecurityProfileId";
        let insertPromise = new Promise((resolve,reject) => {
            const spArray = agent.spArray;
            for (let i = 0; i < spArray.length; i++) {
                const spID = spArray[i];
                this.pool.query(insertSQL, [agentid, spID], (err, res) => {
                    if(err) {
                        logger.error(`Error inserting user ${agent.username} security profiles with message: ${err.message}`, insertSQL);
                        logger.info(err);
                           
                        this.pool.query('ROLLBACK', err => {
                            if (err) {
                                logger.error(`Error rolling-back user ${agent.username} security profiles insertion with message: ${err.message}`);
                                reject(err);
                            }
                        });
                        reject(err);
                    } else {
                        this.pool.query('COMMIT', err => {
                            if (err) {
                                logger.error(`Error committing user ${agent.username} security profiles with message: ${err.message}`);
                                this.pool.query('ROLLBACK', err => {
                                    if (err) {
                                        logger.error(`Error rolling-back user ${agent.username} security profiles insertion commit with message: ${err.message}`);
                                        reject(err);
                                    }
                                });
                                reject(err);
                            }
                        });
                        resolve(res);
                    }
                });
            }
        });
        return insertPromise;
    }

    async insertUserBU(agent, agentid) {
        const buArray = agent.buArray;    
        let insertSQL = "INSERT INTO AgentBusinessUnit VALUES ($1, $2) RETURNING BusinessUnitId";
        let insertPromise = new Promise((resolve,reject) => {
            for (let i = 0; i < buArray.length; i++) {
                const buName = buArray[i];
                this.pool.query(insertSQL, [agentid, buName], (err, res) => {
                    if(err) {
                        logger.error(`Error inserting user ${agent.username} business units with message: ${err.message}`);
                        this.pool.query('ROLLBACK', err => {
                            if (err) {
                                logger.error(`Error rolling-back user ${agent.username} business units insertion with message: ${err.message}`);
                                reject(err);
                            }
                        });
                        reject(err);
                    } else {
                        this.pool.query('COMMIT', err => {
                            if (err) {
                                logger.error(`Error committing user business units with message: ${err.message}`);
                                this.pool.query('ROLLBACK', err => {
                                    if (err) {
                                        logger.error(`Error rolling-back user ${agent.username} business units insertion commit with message: ${err.message}`);
                                        reject(err);
                                    }
                                });
                                reject(err);
                            }
                        });
                        resolve(res);
                    }
                });
            }
        });
        return insertPromise;
    }

    async insertUser(agent) {
        let insertSQL = "INSERT INTO agent VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";
        let insertPromise = new Promise((resolve,reject) => {
            this.pool.query(insertSQL, [agent.id,agent.username,agent.firstname,agent.lastname,agent.routingProfileId, agent.acwTimeout,agent.autoAcceptCall], (err, res) => {
                if(err) {
                    logger.error(`Error inserting user ${agent.username} on Agent table with message: ${err.message}`);
                    this.pool.query('ROLLBACK', err => {
                        if (err) {
                            logger.error(`Error rolling-back user ${agent.username} insertion with message: ${err.message}`);
                            reject(err);
                        }
                    });
                    reject(err);
                    throw err;
                } else {
                    this.pool.query('COMMIT', err => {
                        if (err) {
                            logger.error(`Error committing user ${agent.username} on Agent table with message: ${err.message}`);
                            this.pool.query('ROLLBACK', err => {
                                if (err) {
                                    logger.error(`Error rolling-back user ${agent.username} insertion commit with message: ${err.message}`);
                                    reject(err);
                                }
                            });
                            reject(err);
                        }
                    });
                    logger.info(`Admin Portal user ${agent.username} successfully inserted on Agent table`);
                    resolve(res);
                }
            });
        }).then((userId) =>{
            return this.insertUserSP(agent, agent.id);
        }).then((secid) => {
            return this.insertUserBU(agent, agent.id);
        }).then((buid) => {
            return buid;
        }).catch((e) => {
            logger.error(`Error inserting user ${agent.username} as promise chaining error: ${e.message}`);
            throw e;
        }).catch((e) => {
            
        });
        return insertPromise;
    }
    
    async deleteUser(userId) {      
        let deleteSQL = "DELETE FROM Agent WHERE id = $1";
        let deletePromise = new Promise((resolve,reject) => {
            this.pool.query(deleteSQL, [userId], (err, res) => {
                if(err) {
                    logger.error(`Error deleting user in Agent table with message: ${err.message}`);
                    logger.error(err.message);
                    this.pool.query('ROLLBACK', err => {
                        if (err) {
                            logger.error(`Error rolling-back user deletion with message: ${err.message}`);
                            reject(err);
                        }
                    });
                    reject(err);
                }
                else {
                    this.pool.query('COMMIT', err => {
                        if (err) {
                            logger.error(`Error committing user deletion with message: ${err.message}`);
                            this.pool.query('ROLLBACK', err => {
                                if (err) {
                                    logger.error(`Error rolling-back during user deletion commit with message: ${err.message}`);
                                    reject(err);
                                }
                            });
                            reject(err);
                        }
                    });
                    resolve(res);
                }
            });
        }).catch((e) => {
            logger.error(`Unexpected exception deleting user from AP database with message: ${e.message}`);
    });
    return deletePromise;
    }
}

module.exports = PostgresClient;
