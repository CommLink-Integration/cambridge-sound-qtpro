const QTPro = require('./qtpro.js');

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
    qtpro.getSystemParam(getSystemArgs, (err, res) => {
        if (err) console.error(err)
        else console.log(`The IP address of this Qt Pro unit is ${res[getSystemArgs.parameter]}`);
    });

    const getZoneArgs = {
        zone: 1, // 0-indexed zone number, so this is asking for Zone 2
        parameter: 'masking_max'
    };
    qtpro.getZoneParam(getZoneArgs, (err, res) => {
        if (err) console.error(err);
        else console.log(`The maximum masking level for Zone 2 of this Qt Pro unit is ${res[getZoneArgs.parameter]}`);
    });

    const setSystemArgs = {
        parameter: 'unit_name',
        value: 'CommLink Integration Corp HQ'
    };
    qtpro.setSystemParam(setSystemArgs, (err, res) => {
        if (err) console.error(err);
        else console.log(`The unit name was${res ? '' : ' not'} set to ${setSystemArgs.value}`);
    });

    const setZoneArgs = {
        zone: 1,
        parameter: 'masking_min',
        value: 10
    };
    qtpro.setZoneParam(setZoneArgs, (err, res) => {
        if (err) console.error(err);
        else console.log(`The minimum masking level for Zone 2 was${res ? '' : ' not'} set to ${setZoneArgs.value}`);
    });

    qtpro.getAllSystemParams((err, res) => {
        if (err) console.error(err);
        else console.log('The system parameters are:', res);
    });

    qtpro.getAllZoneParams({zone: 0}, (err, res) => {
        if (err) console.error(err);
        else console.log('Zone 1 parameters are:', res);
    });

    setTimeout(() => { process.exit(0) }, 5000);
});