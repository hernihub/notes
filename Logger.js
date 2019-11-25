const bunyan = require('bunyan');

let bunyanOptions = {
    name: 'axt-um-management-function-logger',
    level: bunyan.INFO
};

let log = bunyan.createLogger(bunyanOptions);

let logger = {
    debug: function (obj) {
        let result = {};
        result.logType = 'debug';
        result.payLoad = obj;
        log.debug(result);
    },
    info: function (obj) {
        let result = {};
        result.logType = 'info';
        result.payLoad = obj;
        log.info(result);
    },
    error: function (obj, params) {
        let result = {};
        result.logType = 'error';
        result.payLoad = obj;
        result.params = params || 'none';
        log.error(result);
    },
    warn: function (obj) {
        let result = {};
        result.logType = 'warn';
        result.payLoad = obj;
        log.warn(result);
    }
};

module.exports = logger;
