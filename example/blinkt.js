var webthing;

try {
  webthing = require('../webthing');
} catch (err) {
  webthing = require('webthing');
}

var Property = webthing.Property;
var GpioProperty = require('./platform/gpio/gpio-property');
var SingleThing = webthing.server.SingleThing;
var Thing = webthing.Thing;
var Value = webthing.Value;
var WebThingServer = webthing.server.WebThingServer;

function blinktThing() {
    var _this = this;
    this._pixels = [];

    {
      Thing.call(this, 'Blinkt Light', ['OnOffSwitch', 'Light'], 'A blinkt light');
      this.gpioProperties = [new GpioProperty(this, 'data', false, {
        description: 'Data pin on GPIO23'
      }, {
        direction: 'out',
        pin: 23
      }), new GpioProperty(this, 'clock', false, {
        description: 'CLK pin on GPIO 24'
      }, {
        direction: 'out',
        pin: 24
      })];
      this.gpioProperties.forEach(function (property) {
        _this.addProperty(property);
      });

      this.addProperty(new Property(this, 'on', new Value(true, function (v) {
        return console.log('On-State is now', v);
      }), {
        '@type': 'OnOffProperty',
        label: 'On/Off',
        type: 'boolean',
        description: 'Whether the led is turned on'
      }));

      this.addProperty(new Property(this, 'brightness', new Value(50, function (v) {
        return console.log('Brightness is now', v);
      }), {
        '@type': 'BrightnessProperty',
        label: 'Brightness',
        type: 'number',
        description: 'The level of light from 0-1',
        minimum: 0,
        maximum: 100,
        unit: 'percent'
      }));

    this.setAllPixels = function (r, g, b, a) {
        console.log("setAllPixels");
        for (var i = 0; i < 8; i++) {
            this.setPixel(i, r, g, b, a);
        }
    };

    this.setPixel = function setPixel (pixelNum, r, g, b, a) {
        console.log("setAllPixel");
        if (a === undefined) {
            if (this._pixels[pixelNum]) {
                // Set a to current level or 1.0 if none exists
                a = this._pixels[pixelNum][3] !== undefined ? this._pixels[pixelNum][3] : 1.0;
            }
        } else {
            a = parseInt((31.0 * a), 10) & 0x1F;
        }
    
        this._pixels[pixelNum] = [
            parseInt(r, 10) & 255, // jshint ignore:line
            parseInt(g, 10) & 255, // jshint ignore:line
            parseInt(b, 10) & 255, // jshint ignore:line
            a
        ];
    };

        // pixelsp[]
    this.setBrightness = function  (pixelNum, brightness) {setBrightness
        this._pixels[pixelNum][3] = parseInt((31.0 * brightness), 10) & 0x1F;
    };

    this.clearAll = function () {
        console.log("clearAll");
        for (var i = 0; i < 8; i++) {
            this.setPixel(i, 0, 0, 0);
        }
    };

    // update pixels
    
    this.sendUpdate = function () {
        console.log("sendUpdate");
        var i,
            pixel;
    
        this.latch(); // send a 32 bit latch (on/off) sequence
    
        for (i = 0; i < 8; i++) {
            pixel = this._pixels[i];
    
            // Brightness
            this.writeByte(0xE0 | pixel[3]); // jshint ignore:line
            // Blue
            this.writeByte(pixel[2]);
            // Green
            this.writeByte(pixel[1]);
            // Red
            this.writeByte(pixel[0]);
        }
    
        this.latch();
    };

    this.writeByte = function (byte) {
        var bit;
    
        for (var i = 0 ; i < 8; i++) {
            bit = ((byte & (1 << (7 - i))) > 0) === true ? 1 : 0; // jshint ignore:line    
            this.setProperty('data', bit);
            this.setProperty('clock', true);
            this.setProperty('clock', false);

        }
    };

    this.latch = function () {
        console.log("latch");
        this.setProperty('data', false);
        for (var i = 0; i < 36; i++) {
            this.setProperty('clock', true);
            this.setProperty('clock', false);
        }
    };
    

    /*  this.addProperty(new Property(this, 'colorR', new Value(255, function (v) {
        return console.log('red is now', v);
      }), {
        '@type': 'RedColorProperty',
        label: 'ColorR',
        type: 'number',
        description: 'The red color of light',
        minimum: 0,
        maximum: 255
      }));

      this.addProperty(new Property(this, 'colorG', new Value(255, function (v) {
        return console.log('green is now', v);
      }), {
        '@type': 'GreenColorProperty',
        label: 'ColorG',
        type: 'number',
        description: 'The green color of light',
        minimum: 0,
        maximum: 255
      }));

      this.addProperty(new Property(this, 'colorB', new Value(255, function (v) {
        return console.log('blue is now', v);
      }), {
        '@type': 'BluecolorProperty',
        label: 'ColorB',
        type: 'number',
        description: 'The blue color of light',
        minimum: 0,
        maximum: 255
      })); */

      console.log("ziran - on");
      this.clearAll();
      this.setAllPixels(0, 156, 0, 0.1);
      this.sendUpdate();
     
      return this;
    }
}
  
  function runServer() {
    var port = process.argv[2] ? Number(process.argv[2]) : 8888;
    var url = "http://localhost:".concat(port, "/properties/on");
    console.log("Usage:\n\n".concat(process.argv[0], " ").concat(process.argv[1], " [port]\n\nTry:\ncurl -X PUT -H 'Content-Type: application/json' --data '{\"on\": true }' ").concat(url, "\n"));
    var thing = blinktThing();
    var server = new WebThingServer(new SingleThing(thing), port);
    process.on('SIGINT', function () {
      server.stop();
      process.exit();
    });
    server.start();
  }
  
  runServer();