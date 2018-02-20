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
    this.powerURL = config["power_url"];
    this.powerOffURL = config["power_off_url"];
    this.upURL = config["up_url"];
    this.upOffURL = config["up_off_url"];
    this.downURL = config["down_url"];
    this.downOffURL = config["down_off_url"];
    this.movePercentDuration = config["move_percent_duration"];
    this.startDelay = config["start_delay"];
    this.endDelay = config["end_delay"];
    this.httpMethod = config["http_method"] || "POST";

    // state vars
    this.powerState = 0; // state of main power supply, off by  default
    //this.lastPosition = 0; // last known position of the blinds, down by default
    this.lastPosition = this.storage.getItem('blinds_position_state');
    this.currentPositionState = 2; // stopped by default
    //this.currentTargetPosition = 0; // down by default
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
    this.log("Requested CurrentPosition: %s", this.lastPosition);
    callback(null, this.lastPosition);
}

ZWayVeluxAccessory.prototype.getPositionState = function(callback) {
    this.log("Requested PositionState: %s", this.currentPositionState);
    callback(null, this.currentPositionState);
}

ZWayVeluxAccessory.prototype.getTargetPosition = function(callback) {
    this.log("Requested TargetPosition: %s", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

ZWayVeluxAccessory.prototype.setTargetPosition = function(pos, callback) {
    
    // only perform action on state change
    if (this.lastPosition != pos) {
        
        // switch on the power supply
        if (this.powerState == 0) {
            this.httpRequest(this.powerURL, this.httpMethod, function() {
                this.log(this.httpMethod + ": " + this.powerURL);
                this.powerState = 1;
            }.bind(this));
        }
        
        // clear start timer on change
        clearTimeout(this.startTimeout);
        
        // only start if blinds are not moving
        if (!this.stopTimeout) {

            // 1s delay before starting any change action
            this.startTimeout = setTimeout(() => {            
                this.currentTargetPosition = pos;
                this.storage.setItem('blinds_position_state', this.currentTargetPosition);
                const moveUp = (this.currentTargetPosition >= this.lastPosition);
                const distance = Math.abs(this.currentTargetPosition - this.lastPosition);
                this.log("MOVING FROM: " + this.lastPosition + " TO: " + this.currentTargetPosition + " = " + (moveUp ? "UP: " : "DOWN: ") + distance);
                this.service
                    .setCharacteristic(Characteristic.PositionState, (moveUp ? 1 : 0));
                this.currentPositionState = (moveUp ? 1 : 0);
                this.httpRequest((moveUp ? this.upURL : this.downURL), this.httpMethod, function() {
                    this.log(this.httpMethod + ": " + (moveUp ? this.upURL : this.downURL));
                }.bind(this));
                
                // wait for blinds moving to target state, then stop
                this.stopTimeout = setTimeout(() => {
                    this.stopTimeout = null;
                    
                    this.httpRequest((moveUp ? this.upOffURL : this.downOffURL), this.httpMethod, function() {
                        this.log(this.httpMethod + ": " + (moveUp ? this.upOffURL : this.downOffURL));
                    }.bind(this));
                    
                    this.log("DONE!");
                    this.service
                        .setCharacteristic(Characteristic.PositionState, 2);
                    this.currentPositionState = 2;
                    this.service
                        .setCharacteristic(Characteristic.CurrentPosition, pos);
                    this.lastPosition = pos;
                    
                    // switch off the power supply after 1s
                    setTimeout(() => {                    
                        if (this.powerState == 1) {
                            this.httpRequest(this.powerOffURL, this.httpMethod, function() {
                                this.log(this.httpMethod + ": " + this.powerOffURL);
                                this.powerState = 0;
                            }.bind(this));
                        }
                    }, 1000);
                    
                }, this.startDelay + this.movePercentDuration * distance + (pos == 0 || pos == 100 ? this.endDelay : 0));
            }, 1000);
        }
    }
    callback(null);
}

ZWayVeluxAccessory.prototype.httpRequest = function(url, method, callback) {
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
}

ZWayVeluxAccessory.prototype.getServices = function() {
    return [this.service];
}