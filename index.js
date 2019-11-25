'use strict';
require('./code/utils');
const logger = require('./code/Logger');

let securityProfileMap = {};
let businessUnitMap = {};
let ldap = {};
let connect = {};
let postgres = {};
let sql = {};
let data = undefined;
let dbData = {};

exports.handler = async (event, context, callback) => {
    if (!data) {
        logger.info(`Uninitialized data; initializing once...`);
        try {
            data = await initialize();
            ldap = data.ldap;
            connect = data.connect;
            securityProfileMap = data.securityProfileMap;
        } catch (e) {
            logger.error(`Error initializing parameters for lambda. Exiting process...`);
            logger.error(e);
            process.exit(-1);
        }
    }

    try {
        dbData = await initializeDB();
        postgres = dbData.postgres;
        businessUnitMap = dbData.businessUnitMap;
    } catch (error) {
        logger.error(`Error initializing database connection and data. Exiting process...`);
        logger.error(error);
        process.exit(-1);
    }
    
    // GRAB THE USERS AND RELATED DATA FROM LDAP
    let {deleteUsersFlag, ldapUsersMap, userIdsArray, userToGroupMap, userToBUsMap, userToSPsMap} = await ldap.getLDAPData();
    
    // logger.info(`Delete users from Admin portal?: ${deleteUsersFlag}`);
    logger.info(`Number of AD users: ${userIdsArray.length}`);
    logger.info(`AD users: ${JSON.stringify(userIdsArray)}`);
    
    // QUERY ADMIN PORTAL DATABASE AND FIND THE DIFFERENCES THEN UPDATE THE DATABASE AND AMAZON CONNECT WITH THIS DIFFERENCE
    for (let i = 0; i < userIdsArray.length; i++) {
        const sAMAccountName = userIdsArray[i];
        const ldapUser = ldapUsersMap.get(sAMAccountName);
        const user = fromUserToAgent(connect.getDefaultRPId(),ldapUser, userToGroupMap[sAMAccountName], securityProfileMap, userToBUsMap, userToSPsMap, businessUnitMap);
        
        let userInfo = {};
        try {
            userInfo = await postgres.getUserInfo(sAMAccountName);
        } catch (error) { // Already logs in Postgres client
            continue;
        }
            
        if(userInfo.rows.length != 0) {
            const sqlRows = userInfo.rows;

            logger.info(`Admin Portal user ${sAMAccountName} found`);
            // logger.info(`LDAP attributes for ${sAMAccountName}: ${JSON.stringify(user.attributes)}`);
            // logger.info(`Admin Portal attributes for ${sAMAccountName}: ${JSON.stringify(sqlRows)}`);

            const same = compareUser(user.attributes, sqlRows);
            // logger.info(`Are they the same?: ${same}`);

            if(!same) {
                await postgres.updateUserSPandBU(user, sqlRows[0].agentid).then(async (res) => {
                    logger.info(`User ${user.username} security profiles and/or business units updated in Admin Portal`);
                    await connect.updateUserSecurityProfiles(user, sqlRows[0].agentid);
                }).then((res) => {
                }).catch((e) => { // Already logs in Connect/Postgres client
                });
            }     
        } else {
            logger.info(`Admin Portal user ${user.username} not found`);
            try {
                const connectUserCreationResult = await connect.createUser(user);
                user.id = connectUserCreationResult.UserId;
            } catch (error) {
               logger.error(`Amazon Connect user creation unsuccessful with message: ${JSON.stringify(error)}`);
               continue;
            }
            
            try {
                await postgres.insertUser(user);      
            } catch (error) {
                logger.error(`Admin Portal user insertion unsuccessful with message: ${JSON.stringify(error)}`);
                logger.error(`Deleting the user ${user.username} from Amazon Connect`);
                const amazonConnnectUserCreationgRollBack = await connect.deleteUser(user.id);
            }
            

            
            // logger.info(`Admin Portal user ${user.username} not found`);
            // await connect.createUser(user).then(async (connectUserCreationResult) => {
            //     user.id = connectUserCreationResult.UserId; // Set the user ID as the Amazon Connect ID
            //     await postgres.insertUser(user);
            // }).then((buid) => {
            //     logger.info(`User ${user.username} created in Admin Portal`);
            // }).catch((e) => { // Already logs in Connect/Postgres client
            // });
        }
    }
        
    if(deleteUsersFlag === true) {
        sql = `SELECT ag.username, ag.id FROM Agent ag`;
        const queryRes = await postgres.query(sql);
        const queryRows = queryRes.rows;    
        const toRemoveUserArray = queryRows.filter(e => userIdsArray.indexOf(e.username) < 0);
        
        logger.info(`Number of users to remove from Admin Portal and Amazon Connect: ${toRemoveUserArray.length}`);
        logger.info(`Users to remove from Admin portal and Amazon Connect:', ${JSON.stringify(toRemoveUserArray)}`);
            
        for (let i = 0; i < toRemoveUserArray.length; i++) {
            const user = toRemoveUserArray[i];
            await postgres.deleteUser(user.id).then(async (res) => {
                logger.info(`User ${user.username} deleted from Admin Portal`);
                await connect.deleteUser(user.id);
            }).then((delRes) => {
                logger.info(`User ${user.username} deleted from Amazon Connect`);
            }).catch((e) => {
                logger.error(JSON.stringify(e));
            });
        }
    }
};

