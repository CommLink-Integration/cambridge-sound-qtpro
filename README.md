# cambridge-sound-qtpro
Node package for communicating with Cambridge Sound Qt series sound masking systems through their telnet-based command line interface.

Tested with QtPro 300 but should work with any Qt series sound masking system that implements the telnet command line interface.

Basic testing has been done but there are likely to be uncaught edge cases. Issues and pull requests are welcome.

## Install
`npm install cambridge-sound-qtpro`

## Quick start

```js
const QTPro = require('cambridge-sound-qtpro');

const params = {
    ip: '172.16.10.141', 
    model: 'QT300',
    port: 23, // default
    reconnect: true // default
};

const qtpro = new QTPro(params);

qtpro.on('ready', () => {
    const getSystemArgs = {
        parameter: 'ip_address'
    };
    qtpro.getSystemParam(getSystemArgs, (res) => {
        console.log(`The IP address of this Qt Pro unit is ${res[getSystemArgs.parameter]}`);
    });

    const getZoneArgs = {
        zone: 1, // 0-indexed zone number, so this is asking for Zone 2
        parameter: 'masking_max'
    };
    qtpro.getZoneParam(getZoneArgs, (res) => {
        console.log(`The maximum masking level for Zone 2 of this Qt Pro unit is ${res[getZoneArgs.parameter]}`);
    });

    const setSystemArgs = {
        parameter: 'unit_name',
        value: 'CommLink Integration Corp HQ'
    };
    qtpro.setSystemParam(setSystemArgs, (res) => {
        console.log(`The unit name was ${res ? '' : 'not'} set to ${setSystemArgs.value}`);
    });

    const setZoneArgs = {
        zone: 1,
        parameter: 'masking_min',
        value: 12
    };
    qtpro.setZoneParam(setZoneArgs, (res) => {
        console.log(`The minimum masking level for Zone 2 was ${res ? '' : 'not'} set to ${setZoneArgs.value}`);
    });

    qtpro.getAllSystemParams((res) => {
        console.log(`The system parameters are ${res}`);
    });

    qtpro.getAllZoneParams({zone: 0}, (res) => {
        console.log(`Zone 1 parameters are ${res}`);
    });
});
```
## Classes

<dl>
<dt><a href="#QTPro">QTPro</a></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#getOneCallback">getOneCallback</a> : <code>function</code></dt>
<dd><p>Callback for requesting one system or zone parameter</p>
</dd>
<dt><a href="#getAllCallback">getAllCallback</a> : <code>function</code></dt>
<dd><p>Callback for requesting all system or zone parameters</p>
</dd>
<dt><a href="#setCallback">setCallback</a> : <code>function</code></dt>
<dd><p>Callback for setting one system or zone parameter</p>
</dd>
</dl>

<a name="QTPro"></a>

## QTPro
**Kind**: global class  
* **Emits**:
	* <code>QTPro#event:ready - When the connection is ready for data to be sent/received</code>
	* <code>QTPro#event:disconnected - When the connection is not active</code>
	* <code>QTPro#event:connecting - While the connection attempt it being made</code>
	* <code>QTPro#event:error - On a connection error</code> 

* [QTPro](#QTPro)
    * [new QTPro(params)](#new_QTPro_new)
    * [.connect()](#QTPro+connect)
    * [.reset([cb])](#QTPro+reset)
    * [.getAllSystemParams([cb])](#QTPro+getAllSystemParams)
    * [.getSystemParam(parameter, [cb])](#QTPro+getSystemParam)
    * [.setSystemParam(parameter, value, [cb])](#QTPro+setSystemParam)
    * [.getAllZoneParams(zone, [cb])](#QTPro+getAllZoneParams)
    * [.getZoneParam(zone, parameter, [cb])](#QTPro+getZoneParam)
    * [.setZoneParam(zone, parameter, value, [cb])](#QTPro+setZoneParam)

<a name="new_QTPro_new"></a>

### new QTPro(params)
Create a QTPro unit.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  |  |
| params.ip | <code>string</code> |  | The IP address of the unit |
| params.model | <code>string</code> |  | The model of QTPro connecting to, options are 'QT300' or 'QT600' |
| [params.port] | <code>number</code> | <code>23</code> | The port number the unit is listening on |
| [params.reconnect] | <code>boolean</code> | <code>true</code> | If the connection should attempt to re-establish after closing |
<a name="QTPro+connect"></a>

### qtPro.connect()
Attempts to connect to the Qt Pro unit. This is run automatically on class instantiation but 
can be used manually to reconnect if `reconnect` is set to false in the constructor `params`

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  
<a name="QTPro+reset"></a>

### qtPro.reset([cb])
Sends a software reset command to the QtPro unit. If `reconnect` is set to false in the constructor `params`, the Qt Pro connection will be lost and not recovered

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| [cb] | [<code>setCallback</code>](#setCallback) | The callback to run against the response |

<a name="QTPro+getAllSystemParams"></a>

### qtPro.getAllSystemParams([cb])
A special request to get all of the system parameters for a Qt Pro unit

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| [cb] | [<code>getAllCallback</code>](#getAllCallback) | The callback to run against the response |

<a name="QTPro+getSystemParam"></a>

### qtPro.getSystemParam(parameter, [cb])
Sends a get command to the QtPro unit and returns a parsed response object

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| parameter | <code>string</code> | The parameter to get. Valid values are in api.system.get |
| [cb] | [<code>getOneCallback</code>](#getOneCallback) | The callback to run against the response |

<a name="QTPro+setSystemParam"></a>

### qtPro.setSystemParam(parameter, value, [cb])
Sends a set command to the QtPro unit

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| parameter | <code>string</code> | The parameter to set. Valid values are in api.system.set |
| value | <code>string</code> | The value the parameter will be set to |
| [cb] | [<code>setCallback</code>](#setCallback) | The callback to run against the response |

<a name="QTPro+getAllZoneParams"></a>

### qtPro.getAllZoneParams(zone, [cb])
A special request to get all of the parameters for a specific zone

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| zone | <code>Number</code> | The zone to get all parameters for |
| [cb] | [<code>getAllCallback</code>](#getAllCallback) | The callback to run against the response |

<a name="QTPro+getZoneParam"></a>

### qtPro.getZoneParam(zone, parameter, [cb])
Sends a get command to the QtPro unit and returns a parsed response object

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| zone | <code>Number</code> | The 0-indexed zone number the parameter will be set for |
| parameter | <code>string</code> | The parameter to get. Valid values are in api.zone.get |
| [cb] | [<code>getOneCallback</code>](#getOneCallback) | The callback to run against the response |

<a name="QTPro+setZoneParam"></a>

### qtPro.setZoneParam(zone, parameter, value, [cb])
Sends a set command to the QtPro unit

**Kind**: instance method of [<code>QTPro</code>](#QTPro)  

| Param | Type | Description |
| --- | --- | --- |
| zone | <code>Number</code> | The 0-indexed zone number the parameter will be set for |
| parameter | <code>string</code> | The parameter to set. Valid values are in api.zone.set |
| value | <code>string</code> | The value the parameter will be set to |
| [cb] | [<code>setCallback</code>](#setCallback) | The callback to run against the response |

<a name="getOneCallback"></a>

## getOneCallback : <code>function</code>
Callback for requesting one system or zone parameter

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| res | <code>object</code> | an object with a single property, the value of the parameter property passed to the get* method, and it's current value according the QTPro unit |

<a name="getAllCallback"></a>

## getAllCallback : <code>function</code>
Callback for requesting all system or zone parameters

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| res | <code>object</code> | an object with a property for every system or zone entry in `./api.js` and it's current value |

<a name="setCallback"></a>

## setCallback : <code>function</code>
Callback for setting one system or zone parameter

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| res | <code>boolean</code> | true if the set was successful, false otherwise |

## Authors

* **Hunter Grayson** - [hunter-hunter](https://github.com/hunter-hunter)

See also the list of [contributors](https://github.com/CommLink-Integration/cambridge-sound-qtpro/contributors) who participated in this project.

## License

[MIT License](https://andreasonny.mit-license.org/2019)