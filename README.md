# homebridge-zway-velux
[![npm version](https://badge.fury.io/js/homebridge-zway-velux.svg)](https://badge.fury.io/js/homebridge-zway-velux)

Homebridge plugin for controlling Velux blinds by triggering Z-Wave switches via HTTP using a Z-Way Server instance

Example config.json:

```
    "accessories": [
        {
            "accessory": "ZWayVelux",
            "name": "Rollos",
            "power_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_3-1-37/command/on",
            "power_off_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_3-1-37/command/off",
            "up_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_4-2-37/command/on",
            "up_off_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_4-2-37/command/off",
            "down_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_4-0-37/command/on",
            "down_off_url": "http://localhost:8083/ZAutomation/api/v1/devices/ZWayVDev_zway_4-0-37/command/off",
            "move_percent_duration": 375,
            "start_delay": 1750,
            "end_delay": 6000,
            "http_method": "GET"
        } 
    ]

```
