import * as cac from "samsung-cac";

let Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-samsung-cac', 'SamsungCAC', Airconditioner);
};


function operation_mode_to_cooling_state(state) {
    if(state.power == cac.PowerMode.Off) {
        return Characteristic.CurrentHeatingCoolingState.OFF;
    }
    if(state.mode == cac.OperationMode.Cool) {
        return Characteristic.CurrentHeatingCoolingState.COOL;
    }
    if(state.mode == cac.OperationMode.Heat) {
        return Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    return Characteristic.CurrentHeatingCoolingState.COOL;
}

class Airconditioner {
    constructor(log, config) {
        this.log = log;
        this.name = config.name;

        this.host = config.host;
        this.token = config.token;

        this.maxTemperature = config.maxTemperature || 35;
        this.minTemperature = config.minTemperature || 0;

        this.heatingThresholdTemperature = 18;
        this.coolingThresholdTemperature = 24;

        this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;

        // The value property of CurrentHeatingCoolingState must be one of the following:
        //Characteristic.CurrentHeatingCoolingState.OFF = 0;
        //Characteristic.CurrentHeatingCoolingState.HEAT = 1;
        //Characteristic.CurrentHeatingCoolingState.COOL = 2;
        this.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;

        // The value property of TargetHeatingCoolingState must be one of the following:
        //Characteristic.TargetHeatingCoolingState.OFF = 0;
        //Characteristic.TargetHeatingCoolingState.HEAT = 1;
        //Characteristic.TargetHeatingCoolingState.COOL = 2;
        //Characteristic.TargetHeatingCoolingState.AUTO = 3;
        this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;

        this.thermostatService = new Service.Thermostat(this.name);
        this.fanService = new Service.Fan(`${this.name} Fan`);
        this.device = null;
    }

    getDevice() {
        if(!this.device) {
            this.device = new Promise((resolve, reject) => {
                this.conn = new cac.Connection(this.host);
                this.conn.connect().then((c) => {
                    c.login(this.token).then((_) => {
                        c.deviceList().then((devs) => {
                            c.deviceState(devs[0].duid).then((dev) => {
                                resolve(dev);
                            });
                        });
                    });
                });
            });
        }

        return this.device;
    }

    getServices() {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Daniel Parnell')
            .setCharacteristic(Characteristic.Model, 'Samsung MIM-H02')
            .setCharacteristic(Characteristic.SerialNumber, 'CAC');

        // Off, Heat, Cool
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', callback => {
                this.getDevice().then((dev) => {
                    let state = operation_mode_to_cooling_state(dev.state);
                    this.log('CurrentHeatingCoolingState:', state);
                    callback(null, state);
                });
            })
            .on('set', (value, callback) => {
                this.log('SET CurrentHeatingCoolingState from', this.currentHeatingCoolingState, 'to', value);
                this.currentHeatingCoolingState = value;
                this.targetHeatingCoolingState = value;
                this.getDevice().then((dev) => {
                    if(value == Characteristic.CurrentHeatingCoolingState.OFF) {
                        if(dev.state.power == cac.PowerMode.On) {
                            this.conn.controlDevice(dev.duid, {power: cac.PowerMode.Off}).then((_) => {
                                callback(null);
                            });
                        } else {
                            callback(null);
                        }
                    } else {
                        let new_op = value == Characteristic.CurrentHeatingCoolingState.HEAT ? cac.OperationMode.Heat : cac.OperationMode.Cool;
                        this.conn.controlDevice(dev.duid, {power: cac.PowerMode.On, op: new_op}).then((_) => {
                            callback(null);
                        });
                    }
                });

            });

        // Off, Heat, Cool, Auto
        this.thermostatService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', callback => {
                this.log('TargetHeatingCoolingState:', this.targetHeatingCoolingState);
                callback(null, this.targetHeatingCoolingState);
            })
            .on('set', (value, callback) => {
                this.log('SET TargetHeatingCoolingState from', this.targetHeatingCoolingState, 'to', value);
                this.targetHeatingCoolingState = value;
                this.updateSystem();
                callback(null);
            });

        // Current Temperature
        this.thermostatService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: this.minTemperature,
                maxValue: this.maxTemperature,
                minStep: 1.0
            })
            .on('get', callback => {
                this.getDevice().then((dev) => {
                    let temp = dev.state.current_temp;
                    this.log('CurrentTemperature:', temp);
                    callback(null, temp);
                });
            })
            .on('set', (value, callback) => {
                callback(null);
            });

        // Target Temperature
        this.thermostatService
            .getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                minValue: this.minTemperature,
                maxValue: this.maxTemperature,
                minStep: 1.0
            })
            .on('get', callback => {
                this.getDevice().then((dev) => {
                    let temp = dev.state.target_temp;
                    this.log('TargetTemperature:', temp);
                    callback(null, temp);
                });
            })
            .on('set', (value, callback) => {
                this.getDevice().then((dev) => {
                    this.log('SET TargetTemperature from', dev.state.target_temp, 'to', value);
                    this.conn.controlDevice(dev.duid, {target_temp: value}).then(() => {
                        callback(null);
                    });
                });
            });

        // °C or °F for units
        this.thermostatService
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', callback => {
                this.log('TemperatureDisplayUnits:', this.temperatureDisplayUnits);
                callback(null, this.temperatureDisplayUnits);
            })
            .on('set', (value, callback) => {
                this.log('SET TemperatureDisplayUnits from', this.temperatureDisplayUnits, 'to', value);
                this.temperatureDisplayUnits = value;
                callback(null);
            });

        // Auto max temperature
        this.thermostatService
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({
                minValue: this.minTemperature,
                maxValue: this.maxTemperature,
                minStep: 0.1
            })
            .on('get', callback => {
                this.log('CoolingThresholdTemperature:', this.coolingThresholdTemperature);
                callback(null, this.coolingThresholdTemperature);
            })
            .on('set', (value, callback) => {
                this.log('SET CoolingThresholdTemperature from', this.coolingThresholdTemperature, 'to', value);
                this.coolingThresholdTemperature = value;
                callback(null);
            });

        // Auto min temperature
        this.thermostatService
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({
                minValue: this.minTemperature,
                maxValue: this.maxTemperature,
                minStep: 0.1
            })
            .on('get', callback => {
                this.log('HeatingThresholdTemperature:', this.heatingThresholdTemperature);
                callback(null, this.heatingThresholdTemperature);
            })
            .on('set', (value, callback) => {
                this.log('SET HeatingThresholdTemperature from', this.heatingThresholdTemperature, 'to', value);
                this.heatingThresholdTemperature = value;
                callback(null);
            });

        this.thermostatService
            .getCharacteristic(Characteristic.Name)
            .on('get', callback => {
                callback(null, this.name);
            });

        return [informationService, this.thermostatService];
    }

}
