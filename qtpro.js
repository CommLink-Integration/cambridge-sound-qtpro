const Telnet = require('telnet-client');
const EventEmitter = require('events');
const api = require('./api');

class QTPro extends EventEmitter {
    /**
     * Create a QTPro unit.
     * @param {Object} params
     * @param {string} params.ip - The IP address of the unit
     * @param {string} params.model - The model of Qt Pro that's being connected to, options are 'QT300' or 'QT600'
     * @param {number} [params.port=23] - The port number the unit is listening on
     * @param {boolean} [params.reconnect=true] - If the connection should attempt to re-establish after closing
     */
    constructor({ip, model, port=23, reconnect=true}) {
        super();

        this._debug = true;
        this.ip = ip;
        this.port = port;
        this._reconnect = reconnect;
        this._reconnectTimeout = 5000;

        this.ready = false;
        if (model === 'QT300') {
            this.model = model;
            this.numZones = 3;
        } else if (model === 'QT600') {
            this.model = model;
            this.numZones = 6;
        } else {
            console.error(`Not a valid QTPro model identifier: ${model}`);
            return;
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
        })

        this.onReady = async (prompt) => {
            if (this._debug) console.log('Ready')
            this.ready = true;
            // console.log(this.connection.state)
            // console.log(prompt) // Cambridge Sound Management Telnet Window, v1.0
            // QT-300 looks like it gets something stuck in it's receive buffer on connecting. send \r to get a clean prompt back
            // This is even required when connecting over telnet manually
            let res = await this.connection.send('', {waitfor: '{NAK}\r\n'}) 
            if (this._debug) console.log(res)
            
            this._keepAliveInterval = setInterval(() => {
                this.reqToSend('', ()=>{}); // just send \r\n every this._keepAliveTime millis to keep the connection open
            }, this._keepAliveTime)

            setTimeout(() => { this.emit('ready') }, 100); // add a small delay before being ready to send. seems to be a problem when sending data immediately after the connection 'ready' event is received
        }

        this.onTimeout = () => {
            if (this._debug) console.log('Socket timeout!');
            this.connection.end();
        };

        this.onClose = () => {
            // TODO: add option to automatically attempt reconnect
            this._cleanup();
            if (this._debug) console.log('Connection closed');
            if (this._reconnect) {
                if (this._debug) console.log(`Attempting reconnect in ${this._reconnectTimeout/1000} seconds`);
                setTimeout(() => {
                    this.connect();
                }, this._reconnectTimeout);
            }
        };

        this.onError = () => {
            if (this._debug) console.log('Connection error');
        };

        this.connection = new Telnet();
        this.connect();
    }

    async connect() {
        // console.log(this.connection.state)
        const params = {
            host: this.ip,
            port: this.port || 23,
            shellPrompt: '', // or negotiationMandatory: false
            timeout: this._keepAliveTime * 1.2, // this controls connect and idle timeout, ideally there would be a timeout for connecting but not for remaining idle
            ors: '\r',
            initialLFCR: true,
            debug: this._debug
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
            await this.connection.connect(params);
        } catch (error) {
            console.error(`Could not connect to QtPro at ${this.ip}`)
        }
    }

    async close() {
        this.connection.end();
        this._cleanup();
    }

    _cleanup() {
        this.ready = false;
        if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
    }

    async reset(cb) {
        this.reqToSend('ZYXWvU', (res)=> {
            cb(res.replace(/\r\n/,'') == '{ACK,ZYXWvU}')
        });
    }

    async reqToSend(command, cb) {
        // if send buffer is empty, call this._send
        // else add command, cb to buffer
        if (this._readyToSend) this._send(command, cb)
        else this._sendBuffer.push({command, cb})

    }

    async _send(data, cb) {
        // const params = {
        //     timeout: 3000,
        //     ors: '\r\n',
        // };
        this._readyToSend = false;

        if (this._debug) console.log(`Sending ${data} to QtPro`);
        try {
            // since connect params timeout is 0, need to do something else here to make sure
            // we get a response in a timely manner and error if not received
            let res = await this.connection.send(data, {waitfor: '\r\n'})
            if (this._debug) console.log('async result:', res)
            if (typeof cb == 'function' ) {
                cb(res)
                this.emit('readyToSend')
            }
            else throw new Error('Callback is not a function')
        } catch (error) {
            console.error('QtPro._send error: ',error)
            this.emit('readyToSend')
        }
    }

    /**
     * Sends a get command to the QtPro unit and returns a parsed response object
     * @param {string} type - The type of command, options are 'system' or 'zone'
     * @param {string} parameter - The parameter to request
     * @param {Number} zoneID - The zone number the parameter will be requested from. Required if type is 'zone'
     */
    _get({type, parameter, zoneID}, cb) {
        let header = '';
        let api_section = {};

        if (type == 'system') {
            header = api.headers.SYSTEM_GET
            api_section = api.system.get;
        } else if (type == 'zone' && zoneID !== undefined) {
            if (zoneID > this.numZones - 1) return undefined
            header = api.headers.ZONE_GET
            api_section = api.zone.get;
        } else {
            return undefined
        }

        const api_string = `${header}${api_section[parameter]}${zoneID !== undefined ? zoneID : ''}`
        const regexp = `{${header}(.*)}`;

        this.reqToSend(api_string, (res)=> {
            if (this._debug) console.log(res)
            cb(this._parseReturnValues(res, regexp, api_section))
        });
    }


    /**
     * Sends a set command to the QtPro unit and returns a parsed response object
     * @param {string} type - The type of command, options are 'system' or 'zone'
     * @param {string} parameter - The parameter to set
     * @param {string} argument - The value the parameter will be set to
     * @param {Number} zoneID - The zone number the parameter will be set for. Required if type is 'zone'
     */
    _set({type, parameter, argument, zoneID}, cb) {
        let header = '';
        let api_section = {};

        if (type == 'system') {
            header = api.headers.SYSTEM_SET
            api_section = api.system.set;
        } else if (type == 'zone' && zoneID !== undefined) {
            if (zoneID > this.numZones - 1) return undefined
            header = api.headers.ZONE_SET
            api_section = api.zone.set;
        } else {
            return undefined
        }
        const arg_string = (argument !== undefined) ? `=${argument}` : '';
        const api_string = `${header}${api_section[parameter]}${zoneID !== undefined ? zoneID : ''}${arg_string}`
        const regexp = `{ACK,(.*)}`;

        this.reqToSend(api_string, (res)=> {
            if (this._debug) console.log(res)
            cb(this._parseReturnValues(res, regexp, api_section))
        });

    }

    /**
     * Parses the values returned from the QtPro unit into a more readable/actionable format
     * for use further up the chain
     * @param {string} response - The response given from the QtPro
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
        let match = response.match(regexp);
        if (match) {
            // console.log(match)
            let returnValues = {}
            const allParameters = match[1].split(',')
            allParameters.forEach(p => {
                let parameter = p.split('=');
                // look if we need to strip off an appended zone number from the parameter
                parameter[0] = parameter[0].replace(/(\w*)\d/,'$1')
                let key = this.getKeyByValue(keyLookupObject, parameter[0])
                if (key) returnValues[key] = parameter[1]
            })
            return returnValues
        } else {
            return undefined
        }
    }

    getKeyByValue(object, value) {
        return Object.keys(object).find(key => object[key] === value);
    }

    /**
     * Callback for requesting one system or zone parameter
     *
     * @callback getOneCallback
     * @param {object} res - an object with a single property, the value of the parameter property passed to the get* method, and it's current value according the QTPro unit
     */

    /**
     * Callback for requesting all system or zone parameters
     *
     * @callback getAllCallback
     * @param {object} res - an object with a property for every system or zone entry in `./api.js` and it's current value
     */

    /**
     * Callback for setting one system or zone parameter
     *
     * @callback setCallback
     * @param {boolean} res - true if the set was successful, false otherwise
     */

    // #region System Parameters
    /**
     * A special request to get all of the system parameters for a Qt Pro unit
     * @param {getAllCallback} [cb] - The callback to run against the response
     */
    getAllSystemParams(cb) {
        const regexp = /{ALSYS=(.*)}/;
        this.reqToSend(api.system.get.all, (res)=> {
            if (typeof cb == 'function') cb(this._parseReturnValues(res, regexp, api.system.get))
        });
    }

    /**
     * Sends a get command to the QtPro unit and returns a parsed response object
     * @param {string} parameter - The parameter to get. Valid values are in api.system.get
     * @param {getOneCallback} [cb] - The callback to run against the response
     */
    getSystemParam({parameter}, cb) {
        if (!(parameter in api.system.get)) {
            throw new Error(`Invalid system parameter to get: ${parameter}`)
        }
        this.reqToSend({type:'system', parameter}, (res)=> {
            if (typeof cb == 'function') cb(this._parseReturnValues(res, regexp, api.system.get))
        });
    }

    /**
     * Sends a set command to the QtPro unit
     * @param {string} parameter - The parameter to set. Valid values are in api.system.set
     * @param {string} value - The value the parameter will be set to
     * @param {setCallback} [cb] - The callback to run against the response
     */
    setSystemParam({parameter, value}, cb) {
        if (!(parameter in api.system.set)) {
            throw new Error(`Invalid system parameter to set: ${parameter}`)
        }

        this._set({type:'system', parameter, argument: value}, (parsed) => {
            if (typeof cb == 'function') cb(parsed[parameter] == value);
        });
    }
    // #endregion System Parameters

    // #region Zone Parameters
    /**
     * A special request to get all of the parameters for a specific zone
     * @param {Number} zone - The zone to get all parameters for
     * @param {getAllCallback} [cb] - The callback to run against the response
     */
    getAllZoneParams({zone}, cb) {
        const regexp = /{ALZONE\d=(.*)}/;
        this.reqToSend(`${api.zone.get.all}${zone}`, (res) => {
            if (typeof cb == 'function') cb(this._parseReturnValues(res, regexp, api.zone.get))
        });
    }

    /**
     * Sends a get command to the QtPro unit and returns a parsed response object
     * @param {Number} zone - The 0-indexed zone number the parameter will be set for
     * @param {string} parameter - The parameter to get. Valid values are in api.zone.get
     * @param {getOneCallback} [cb] - The callback to run against the response
     */
    getZoneParam({zone, parameter}, cb) {
        if (!(parameter in api.zone.get)) {
            throw new Error(`Invalid zone parameter to get: ${parameter}`)
        }
        this.reqToSend({type:'zone', zoneID: zone, parameter}, (res)=> {
            if (typeof cb == 'function') cb(this._parseReturnValues(res, regexp, api.system.get))
        });
    }

    /**
     * Sends a set command to the QtPro unit
     * @param {Number} zone - The 0-indexed zone number the parameter will be set for
     * @param {string} parameter - The parameter to set. Valid values are in api.zone.set
     * @param {string} value - The value the parameter will be set to
     * @param {setCallback} [cb] - The callback to run against the response
     */
    setZoneParam({zone, parameter, value}, cb) {
        if (!(parameter in api.zone.set)) {
            throw new Error(`Invalid zone parameter to set: ${parameter}`)
        }
        this._set({type:'zone', zoneID: zone, parameter, argument: value}, (parsed) => {
            if (typeof cb == 'function') cb(parsed[parameter] == value);
        });
    }
    // #endregion Zone Parameters
}

module.exports = QTPro;
