const QTPro = require('./qtpro.js');


const qtpro = new QTPro({ip: '172.16.10.141', model: 'QT300'});
const masking_volume = 12;
let localObj = {}

qtpro.on('ready', () => {
    console.log('Ready');
    (async () => {
        // setTimeout(()=>{
        //     qtpro.getAllSystemParams()
        // }, 1000)
        // setTimeout(()=>{
        //     qtpro.getAllZoneParams({zone: 1}, (res) => {console.log("CALLBACK Z1: ", res); localObj["1"] = res;})
        // }, 1000)
        // setTimeout(()=>{
        //     qtpro.getAllZoneParams({zone: 2}, (res) => {console.log("CALLBACK Z2: ", res); localObj["2"] = res;})
        // }, 1000)
        qtpro.getSystemParam({parameter: "ip_address"}, (res) => {
            // console.log("IP: ", res)
            localObj["ip_get"] = res;
        });
        qtpro.getZoneParam({zone: 1, parameter: "masking_max"}, (res) => {
            // console.log("Zone 2 masking max: ", res)
            localObj["masking_get"] = res;
        });
        qtpro.setSystemParam({parameter: "unit_name", value: "CommLink Integration HQ"}, (res) => {
            // console.log("Set unit name: ", res)
            localObj["unitname_get"] = res;
        });
        qtpro.setZoneParam({zone: 1, parameter: 'masking_max', value: masking_volume}, (res) => {
            // console.log("Set zone 1 masking max: ", res)
            localObj["masking_set"] = res;
        });

        qtpro.getAllSystemParams((res) => {
            // console.log("System params: ", res); 
            localObj["allsys_get"] = res;
        });
        qtpro.getAllZoneParams({zone: 0}, (res) => {
            // console.log("Zone 1 params: ", res); 
            localObj["zone1_get"] = res;
        });
        qtpro.getAllZoneParams({zone: 1}, (res) => {
            // console.log("Zone 2 params: ", res); 
            localObj["zone2_get"] = res;
        });

        setTimeout(() => {console.log(localObj)}, 2000)

        // qtpro.reset((res) => {
        //     console.log(res)
        // })

        // qtpro.getAllZoneParams({zone: 2}, (res) => {
        //     console.log("Zone 3 params: ", res); localObj["3"] = res;
        //     console.log("LOCAL: ", localObj);
        // });
        // console.log("Zone 1 params: ", res1);
        // const res2 = await qtpro.getAllZoneParams({zone: 1});
        // console.log("Zone 2 params: ", res2);

        // console.log("LOCAL 1: ", localObj)
        // setTimeout(()=>{
        //     console.log("LOCAL 2: ", localObj);
        // }, 3000)
        // let res = await qtpro.setSystemParam({parameter: "unit_name", value: "CommLink Integration HQ"});
        // console.log(res);
        // res = await qtpro.setSystemParam({parameter: "host_name", value: "QT4F"});
        // console.log(res);
        // res = await qtpro.getAllSystemParams();
        // console.log(res);
        // res = await qtpro.getSystemParam({parameter: "ip_address"});
        // console.log(res)
        // res = await qtpro.setZoneParam({zone: 1, parameter: 'masking_max', value: masking_volume});
        // console.log(res)
        // res = await qtpro.setZoneParam({zone: 1, parameter: 'masking_min', value: masking_volume});
        // console.log(res)
        // setInterval(()=>{
        //     qtpro.getZoneParam({zone: 1, parameter: 'masking_min'})
        // }, 5000)
        // res = await qtpro.reset()
        // console.log(res)
        // const res1 = await qtpro.getAllZoneParams({zone: 0});
        // console.log(res1);
        // const res2 = await qtpro.getAllZoneParams({zone: 1});
        // console.log(res2);
        // const res3 = await qtpro.getAllZoneParams({zone: 2});
        // console.log(res3);
    })();
})
