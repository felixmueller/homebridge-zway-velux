var request = require("request");
var Service, Characteristic, HomebridgeAPI;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    
    homebridge.registerAccessory("homebridge-zway-velux", "ZWayVelux", ZWayVeluxAccessory);
}

function ZWayVeluxAccessory(log, config) {
    // global vars
    this.log = log;
    this.storage = require('node-persist');
    
    // init storage
    this.storage.initSync({
        dir: HomebridgeAPI.user.persistPath()
    });
    
    // configuration vars
    this.name = config["name"];
    this.powerOnUrl = config["powerOnUrl"];
    this.powerOffUrl = config["powerOffUrl"];
    this.openStartUrl = config["openStartUrl"];
    this.openStopUrl = config["openStopUrl"];
    this.closeStartUrl = config["closeStartUrl"];
    this.closeStopUrl = config["closeStopUrl"];
    this.durationPerPercent = config["durationPerPercent"];
    this.startDelay = config["startDelay"];
    this.endPositionDelay = config["endPositionDelay"];
    this.httpMethod = config["httpMethod"] || "GET";
    this.debugMode = config["debugMode"] || false;

    // state vars
    // state of main power supply (off by default)
    this.powerState = 0;
    // last known position of the blinds (loaded from disk)
    this.lastPosition = this.storage.getItem('VeluxBlindsPositionState');
    // current position state (stopped by default)
    this.currentPositionState = 2;
    // current target position (last known position by default)
    this.currentTargetPosition = this.lastPosition;
    
    // register the service and provide the functions
    this.service = new Service.WindowCovering(this.name);

    // the current position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L493
    this.service
        .getCharacteristic(Characteristic.CurrentPosition)
        .on('get', this.getCurrentPosition.bind(this));

    // the position state
    // 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1138
    this.service
        .getCharacteristic(Characteristic.PositionState)
        .on('get', this.getPositionState.bind(this));

    // the target position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1564
    this.service
        .getCharacteristic(Characteristic.TargetPosition)
        .on('get', this.getTargetPosition.bind(this))
        .on('set', this.setTargetPosition.bind(this));
}

ZWayVeluxAccessory.prototype.getCurrentPosition = function(callback) {
    this.log("Requested current position (%s \%)", this.lastPosition);
    callback(null, this.lastPosition);
}

ZWayVeluxAccessory.prototype.getPositionState = function(callback) {
    this.log("Requested position state (%s \%)", this.currentPositionState);
    callback(null, this.currentPositionState);
}

ZWayVeluxAccessory.prototype.getTargetPosition = function(callback) {
    this.log("Requested target position (%s \%)", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

ZWayVeluxAccessory.prototype.setTargetPosition = function(pos, callback) {

    // only perform action on state change
    if (this.lastPosition != pos) {
        
        // switch on the power supply
        this.setPowerState(1);
        
        // clear start timer on change
        clearTimeout(this.startTimeout);
        
        // only start if blinds are not moving
        if (!this.stopTimeout) {

            // 1s delay before starting any change action
            this.startTimeout = setTimeout(() => {
                this.currentTargetPosition = pos;
                this.storage.setItem('VeluxBlindsPositionState', this.currentTargetPosition);
                const opening = (this.currentTargetPosition >= this.lastPosition);
                const distance = Math.abs(this.currentTargetPosition - this.lastPosition);
                const endPositionDelayRequired = (pos == 0 || pos == 100);
                const duration = this.startDelay + this.durationPerPercent * distance + (endPositionDelayRequired ? this.endPositionDelay : 0);
                this.log("Moving blinds from %s \% to %s \% (%s %s \%, duration: %s ms.%s)",
                    this.lastPosition, this.currentTargetPosition,
                    (opening ? "opening" : "closing"),
                    distance, duration,
                    (endPositionDelayRequired ? " w/ end position delay" : ""));
                this.service
                    .setCharacteristic(Characteristic.PositionState, (opening ? 1 : 0));
                this.currentPositionState = (opening ? 1 : 0);
                this.operateBlinds(1, this.currentPositionState);
                
                // wait for blinds moving to target state, then stop
                this.stopTimeout = setTimeout(() => {
                    this.stopTimeout = null;
                    this.operateBlinds(0, this.currentPositionState);
                    this.service
                        .setCharacteristic(Characteristic.PositionState, 2);
                    this.currentPositionState = 2;
                    this.service
                        .setCharacteristic(Characteristic.CurrentPosition, pos);
                    this.lastPosition = pos;
                    
                    // switch off the power supply after 1s
                    setTimeout(() => {
                        this.setPowerState(0);
                    }, 1000);
                    
                }, duration);
            }, 1000);
        }
    }
    callback(null);
}

ZWayVeluxAccessory.prototype.setPowerState = function(state) {
    if (this.powerState != state) {
        this.log("Switching %s main power supply", (state == 1 ? "on" : "off"));
        this.httpRequest((state == 1 ? this.powerOnUrl : this.powerOffUrl), this.httpMethod, function() {
            if (!this.debugMode) {
                this.log("Sent request: " + this.httpMethod + " " + (state == 1 ? this.powerOnUrl : this.powerOffUrl));
            }
            this.powerState = state;
        }.bind(this));
    }
}

ZWayVeluxAccessory.prototype.operateBlinds = function(operation, state) {
    this.log("%s %s blinds", (operation == 1 ? "Starting" : "Stopping"), (state == 1 ? "opening" : "closing"));
    this.httpRequest((operation == 1 ? (state == 1 ? this.openStartUrl : this.closeStartUrl) : (state == 1 ? this.openStopUrl : this.closeStopUrl)), this.httpMethod, function() {
        if (!this.debugMode) {
            this.log("Sent request: " + this.httpMethod + " " + (operation == 1 ? (state == 1 ? this.openStartUrl : this.closeStartUrl) : (state == 1 ? this.openStopUrl : this.closeStopUrl)));
        }
    }.bind(this));
}

ZWayVeluxAccessory.prototype.httpRequest = function(url, method, callback) {
    if (!this.debugMode) {
        request({
            method: method,
            url: url,
        }, function(err, response, body) {
            if (!err && response.statusCode == 200) {
                callback(null);
            } else {
                this.log("Error getting state (status code %s): %s", response.statusCode, err);
                callback(err);
            }
        }.bind(this));
    } else {
        callback(null);
    }
}

ZWayVeluxAccessory.prototype.getServices = function() {
    return [this.service];
}