const Telnet = require('telnet-client');
const EventEmitter = require('events');
const api = require('./api');

module.exports = class QTPro extends EventEmitter {
    /**
     * Create a Qt Pro unit.
     * @param {Object} params
     * @param {string} params.ip - The IP address of the unit
     * @param {string} params.model - The model of Qt Pro that's being connected to, options are 'QT300' or 'QT600'
     * @param {number} [params.port=23] - The port number the unit is listening on
     * @param {boolean} [params.reconnect=true] - If the connection should attempt to re-establish after closing
     * @fires QTPro#ready - When the connection is ready for data to be sent/received
     * @fires QTPro#disconnected - When the connection is not active
     * @fires QTPro#connecting - While the connection attempt it being made
     * @fires QTPro#error - On a connection error
     */
    constructor({ ip, model, port = 23, reconnect = true }) {
        super();

        this._debug = false;
        this.ip = ip;
        this.port = port;
        this._reconnect = reconnect;
        this._reconnectTimeout = 20000;

        this.status = 'disconnected';

        if (model === 'QT300') {
            this.model = model;
            this.numZones = 3;
        } else if (model === 'QT600') {
            this.model = model;
            this.numZones = 6;
        } else {
            throw new Error(`Not a valid Qt Pro model identifier: ${model}`);
        }

        this._keepAliveInterval = null;
        this._keepAliveTime = 10000;

        this._sendBuffer = []; // FIFO buffer for sending over the telnet connection
        this._readyToSend = true;

        this.on('readyToSend', () => {
            if (this._sendBuffer.length > 0) {
                const next = this._sendBuffer.shift();
                this._send(next.command, next.cb);
            } else this._readyToSend = true;
        });

        this.onReady = async (prompt) => {
            if (this._debug) console.log('Ready');
            // console.log(this.connection.state)
            // console.log(prompt) // Cambridge Sound Management Telnet Window, v1.0
            // QT-300 looks like it gets something stuck in it's receive buffer on connecting. send \r to get a clean prompt back
            // This is even required when connecting over telnet manually
            const res = await this.connection.send('', { waitfor: '{NAK}\r\n' });
            if (this._debug) console.log(res);

            this._keepAliveInterval = setInterval(() => {
                this.reqToSend('', () => {}); // just send \r\n every this._keepAliveTime millis to keep the connection open
            }, this._keepAliveTime);

            setTimeout(() => {
                this.status = 'ready';
                this.emit(this.status);
            }, 100); // add a small delay before being ready to send. seems to be a problem when sending data immediately after the connection 'ready' event is received
        };

        this.onTimeout = () => {
            if (this._debug) console.log('Socket timeout!');
            this.connection.end();
        };

        this.onClose = () => {
            this._cleanup();
            if (this._debug) console.log('Connection closed');
            if (this._reconnect) {
                if (this._debug) console.log(`Attempting reconnect in ${this._reconnectTimeout / 1000} seconds`);
                setTimeout(() => {
                    this.connect();
                }, this._reconnectTimeout);
            }
        };

        this.onError = () => {
            if (this._debug) console.log('Connection error');
            this.status = 'error';
            this.emit(this.status);
        };

        this.connection = new Telnet();
        this.connect();
    }

    /**
     * Attempts to connect to the Qt Pro unit. This is run automatically on class instantiation but
     * can be used manually to reconnect if reconnect is set to false in the constructor params
     */
    async connect() {
        // console.log(this.connection.state)
        if (this._debug) console.log('Attempting to connect.');
        if (this.status == 'ready' || this.status == 'connecting') {
            if (this._debug) console.log(`Status is already ${this.status}. Stopping attempt to connect.`);
            return;
        }

        const params = {
            host: this.ip,
            port: this.port,
            shellPrompt: '',
            timeout: this._keepAliveTime * 1.2, // this controls connect and idle timeout, ideally there would be a timeout for connecting but not for remaining idle
            ors: '\r',
            initialLFCR: true,
            debug: this._debug,
        };

        // Try to remove the listeners so this function can be called repeatedly on timeout/error/close
        this.connection.removeListener('ready', this.onReady);
        this.connection.removeListener('timeout', this.onTimeout);
        this.connection.removeListener('close', this.onClose);
        this.connection.removeListener('error', this.onError);

        this.connection.on('ready', this.onReady);
        this.connection.on('timeout', this.onTimeout);
        this.connection.on('close', this.onClose);
        this.connection.on('error', this.onError);

        try {
            this.status = 'connecting';
            this.emit(this.status);
            await this.connection.connect(params);
        } catch (error) {
            console.error(`Could not connect to Qt Pro at ${this.ip}`);
        }
    }

    async close() {
        this.connection.end();
        this._cleanup();
    }

    _cleanup() {
        this.status = 'disconnected';
        this.emit(this.status);
        if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
    }

    async reqToSend(command, cb) {
        // if send buffer is empty, call this._send
        // else add command, cb to buffer
        if (this._readyToSend) this._send(command, cb);
        else this._sendBuffer.push({ command, cb });
    }

    async _send(data, cb) {
        // const params = {
        //     timeout: 3000,
        //     ors: '\r\n',
        // };
        this._readyToSend = false;

        if (this._debug) console.log(`Sending ${data} to Qt Pro`);
        try {
            const res = await this.connection.send(data, { waitfor: '\r\n' });
            if (this._debug) console.log('async result:', res);
            if (typeof cb == 'function') {
                cb(null, res);
                this.emit('readyToSend');
            } else throw new Error('Callback is not a function');
        } catch (error) {
            console.error('QtPro._send error: ', error);
            cb(error, null);
            this.emit('readyToSend');
        }
    }

    /**
     * Sends a software reset command to the Qt Pro unit. If reconnect is set to false in the
     * constructor params, the Qt Pro connection will be lost and not recovered
     * @param {setCallback} [cb] - The callback to run against the response
     */
    reset(cb) {
        this.reqToSend('ZYXWvU', (err, res) => {
            if (err) cb(err, null);
            else cb(null, res.replace(/\r\n/, '') == '{ACK,ZYXWvU}');
        });
    }

    /**
     * Sends a get command to the Qt Pro unit and returns a parsed response object
     * @param {string} type - The type of command, options are 'system' or 'zone'
     * @param {string} parameter - The parameter to request
     * @param {Number} zoneID - The zone number the parameter will be requested from. Required if type is 'zone'
     */
    _get({ type, parameter, zoneID }, cb) {
        let header = '';
        let apiSection = {};

        if (type == 'system') {
            header = api.headers.SYSTEM_GET;
            apiSection = api.system.get;
        } else if (type == 'zone') {
            if (!zoneID) {
                cb(new Error('zoneID not defined'), null);
                return;
            }
            if (zoneID > this.numZones - 1) {
                cb(new Error('zoneID greater than number of zones'), null);
                return;
            }
            header = api.headers.ZONE_GET;
            apiSection = api.zone.get;
        } else {
            // This shouldn't be reached
            cb(new Error('Invalid type argument. Must be "system" or "zone"'), null);
            return;
        }

        const apiString = `${header}${apiSection[parameter]}${zoneID !== undefined ? zoneID : ''}`;
        const regexp = `{${header}(.*)}`;

        this.reqToSend(apiString, (err, res) => {
            if (this._debug) console.log(res);
            if (err) cb(err, null);
            else cb(null, this._parseReturnValues(res, regexp, apiSection));
        });
    }

    /**
     * Sends a set command to the Qt Pro unit and returns a parsed response object
     * @param {string} type - The type of command, options are 'system' or 'zone'
     * @param {string} parameter - The parameter to set
     * @param {string} argument - The value the parameter will be set to
     * @param {Number} zoneID - The zone number the parameter will be set for. Required if type is 'zone'
     */
    _set({ type, parameter, argument, zoneID }, cb) {
        let header = '';
        let apiSection = {};

        if (type == 'system') {
            header = api.headers.SYSTEM_SET;
            apiSection = api.system.set;
        } else if (type == 'zone') {
            if (!zoneID) {
                cb(new Error('zoneID not defined'), null);
                return;
            }
            if (zoneID > this.numZones - 1) {
                cb(new Error('zoneID greater than number of zones'), null);
                return;
            }
            header = api.headers.ZONE_SET;
            apiSection = api.zone.set;
        } else {
            // This shouldn't be reached
            cb(new Error('Invalid type argument. Must be "system" or "zone"'), null);
            return;
        }
        const argString = argument !== undefined ? `=${argument}` : '';
        const apiString = `${header}${apiSection[parameter]}${zoneID !== undefined ? zoneID : ''}${argString}`;
        const regexp = `{ACK,(.*)}`;

        this.reqToSend(apiString, (err, res) => {
            if (this._debug) console.log(res);
            if (err) cb(err, null);
            else cb(null, this._parseReturnValues(res, regexp, apiSection));
        });
    }

    /**
     * Parses the values returned from the Qt Pro unit into a more readable/actionable format
     * for use further up the chain
     * @param {string} response - The response given from the Qt Pro
     * @param {RegExp} regexp - Regular expression for stripping all but the key/value pairs
     * @param {object} keyLookupObject - The object that will be used to do a reverse lookup
     */
    _parseReturnValues(response, regexp, keyLookupObject) {
        /* 
        Exmaples:
            response = {ALSYS=MACA=0050C28C2D4F,FIRM=6.7.2,LOCK=1,SENA=0,SENB=0}
            regexp   = /{ALSYS=(.*)}/
            match[1] = MACA=0050C28C2D4F,FIRM=6.7.2,LOCK=1,SENA=0,SENB=0

            response = {CSGET,IPAD=172.16.10.141}
            regexp   = /{CSGET,(.*)}/
            match[1] = IPAD=172.16.10.141
        */
        const match = response.match(regexp);
        if (match) {
            // console.log(match)
            const returnValues = {};
            const allParameters = match[1].split(',');
            allParameters.forEach((p) => {
                const parameter = p.split('=');
                // look if we need to strip off an appended zone number from the parameter
                parameter[0] = parameter[0].replace(/(\w*)\d/, '$1');
                const key = this.getKeyByValue(keyLookupObject, parameter[0]);
                if (key) returnValues[key] = parameter[1];
            });
            return returnValues;
        } else {
            return undefined;
        }
    }

    getKeyByValue(object, value) {
        return Object.keys(object).find((key) => object[key] === value);
    }

    /**
     * Callback for requesting one system or zone parameter
     *
     * @callback getOneCallback
     * @param {error} err - Potential error object
     * @param {object} res - an object with a single property, the value of the parameter property passed to the get* method, and it's current value according the Qt Pro unit
     */

    /**
     * Callback for requesting all system or zone parameters
     *
     * @callback getAllCallback
     * @param {error} err - Potential error object
     * @param {object} res - an object with a property for every system or zone entry in `./api.js` and it's current value
     */

    /**
     * Callback for setting one system or zone parameter
     *
     * @callback setCallback
     * @param {error} err - Potential error object
     * @param {boolean} res - true if the set was successful, false otherwise
     */

    // #region System Parameters
    /**
     * A special request to get all of the system parameters for a Qt Pro unit
     * @param {getAllCallback} [cb] - The callback to run against the response
     */
    getAllSystemParams(cb = () => {}) {
        const regexp = /{ALSYS=(.*)}/;
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        this.reqToSend(api.system.get.all, (err, res) => {
            if (err) cb(err, null);
            else cb(null, this._parseReturnValues(res, regexp, api.system.get));
        });
    }

    /**
     * Sends a get command to the Qt Pro unit and returns a parsed response object
     * @param {string} parameter - The parameter to get. Valid values are in api.system.get
     * @param {getOneCallback} [cb] - The callback to run against the response
     */
    getSystemParam({ parameter }, cb = () => {}) {
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        if (!(parameter in api.system.get)) {
            cb(new Error(`Invalid system parameter to get: ${parameter}`), null);
        }
        this._get({ type: 'system', parameter }, (err, res) => {
            if (err) cb(err, null);
            else cb(null, res);
        });
    }

    /**
     * Sends a set command to the Qt Pro unit
     * @param {string} parameter - The parameter to set. Valid values are in api.system.set
     * @param {string} value - The value the parameter will be set to
     * @param {setCallback} [cb] - The callback to run against the response
     */
    setSystemParam({ parameter, value }, cb = () => {}) {
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        if (!(parameter in api.system.set)) {
            cb(new Error(`Invalid system parameter to set: ${parameter}`), null);
        }

        this._set({ type: 'system', parameter, argument: value }, (err, parsed) => {
            if (err) cb(err, null);
            else cb(null, parsed[parameter] == value);
        });
    }
    // #endregion System Parameters

    // #region Zone Parameters
    /**
     * A special request to get all of the parameters for a specific zone
     * @param {Number} zone - The zone to get all parameters for
     * @param {getAllCallback} [cb] - The callback to run against the response
     */
    getAllZoneParams({ zone }, cb = () => {}) {
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        const regexp = /{ALZONE\d=(.*)}/;
        this.reqToSend(`${api.zone.get.all}${zone}`, (err, res) => {
            if (err) cb(err, null);
            else cb(null, this._parseReturnValues(res, regexp, api.zone.get));
        });
    }

    /**
     * Sends a get command to the Qt Pro unit and returns a parsed response object
     * @param {Number} zone - The 0-indexed zone number the parameter will be set for
     * @param {string} parameter - The parameter to get. Valid values are in api.zone.get
     * @param {getOneCallback} [cb] - The callback to run against the response
     */
    getZoneParam({ zone, parameter }, cb = () => {}) {
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        if (!(parameter in api.zone.get)) {
            cb(new Error(`Invalid zone parameter to get: ${parameter}`), null);
        }

        this._get({ type: 'zone', zoneID: zone, parameter }, (err, res) => {
            if (err) cb(err, null);
            else cb(null, res);
        });
    }

    /**
     * Sends a set command to the Qt Pro unit
     * @param {Number} zone - The 0-indexed zone number the parameter will be set for
     * @param {string} parameter - The parameter to set. Valid values are in api.zone.set
     * @param {string} value - The value the parameter will be set to
     * @param {setCallback} [cb] - The callback to run against the response
     */
    setZoneParam({ zone, parameter, value }, cb = () => {}) {
        if (typeof cb !== 'function') {
            throw new Error('Callback not of function type');
        }
        if (!(parameter in api.zone.set)) {
            cb(new Error(`Invalid zone parameter to set: ${parameter}`), null);
        }

        this._set({ type: 'zone', zoneID: zone, parameter, argument: value }, (err, parsed) => {
            if (err) cb(err, null);
            else cb(null, parsed[parameter] == value);
        });
    }
    // #endregion Zone Parameters
};
