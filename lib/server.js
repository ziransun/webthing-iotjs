/**
 * Node Web Thing server implementation.
 */

'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const https = require('https');
const os = require('os');
const utils = require('./utils');

/**
 * A container for a single thing.
 */
class SingleThing {
  /**
   * Initialize the container.
   *
   * @param {Object} thing The thing to store
   */
  constructor(thing) {
    this.thing = thing;
  }

  /**
   * Get the thing at the given index.
   */
  getThing() {
    return this.thing;
  }

  /**
   * Get the list of things.
   */
  getThings() {
    return [this.thing];
  }

  /**
   * Get the mDNS server name.
   */
  getName() {
    return this.thing.name;
  }
}


/**
 * A container for multiple things.
 */
class MultipleThings {
  /**
   * Initialize the container.
   *
   * @param {Object} things The things to store
   * @param {String} name The mDNS server name
   */
  constructor(things, name) {
    this.things = things;
    this.name = name;
  }

  /**
   * Get the thing at the given index.
   *
   * @param {Number|String} idx The index
   */
  getThing(idx) {
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= this.things.length) {
      return null;
    }

    return this.things[idx];
  }

  /**
   * Get the list of things.
   */
  getThings() {
    return this.things;
  }

  /**
   * Get the mDNS server name.
   */
  getName() {
    return this.name;
  }
}

/**
 * Base handler that is initialized with a list of things.
 */
class BaseHandler {
  /**
   * Initialize the handler.
   *
   * @param {Object} things List of Things managed by the server
   */
  constructor(things) {
    this.things = things;
  }

  /**
   * Get the thing this request is for.
   *
   * @param {Object} req The request object
   * @returns {Object} The thing, or null if not found.
   */
  getThing(req) {
    return this.things.getThing(req.params.thingId);
  }
}

/**
 * Handle a request to / when the server manages multiple things.
 */
class ThingsHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const wsHref = `${req.secure ? 'wss' : 'ws'}://${req.headers.host}`;
    res.json(
      this.things.getThings().map((thing) => {
        const description = thing.asThingDescription();
        description.links.push({
          rel: 'alternate',
          href: `${wsHref}${thing.getHref()}`,
        });
        return description;
      })
    );
  }
}

/**
 * Handle a request to /.
 */
class ThingHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const wsHref = `${req.secure ? 'wss' : 'ws'}://${req.headers.host}`;
    const description = thing.asThingDescription();
    description.links.push({
      rel: 'alternate',
      href: `${wsHref}${thing.getHref()}`,
    });

    res.json(description);
  }
}

/**
 * Handle a request to /properties.
 */
class PropertiesHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    res.json(thing.getProperties());
  }
}

/**
 * Handle a request to /properties/<property>.
 */
class PropertyHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const propertyName = req.params.propertyName;
    if (thing.hasProperty(propertyName)) {
      res.json({[propertyName]: thing.getProperty(propertyName)});
    } else {
      res.status(404).end();
    }
  }

  /**
   * Handle a PUT request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  put(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const propertyName = req.params.propertyName;
    if (!req.body.hasOwnProperty(propertyName)) {
      res.status(400).end();
      return;
    }

    if (thing.hasProperty(propertyName)) {
      try {
        thing.setProperty(propertyName, req.body[propertyName]);
      } catch (e) {
        res.status(400).end();
        return;
      }

      res.json({[propertyName]: thing.getProperty(propertyName)});
    } else {
      res.status(404).end();
    }
  }
}

/**
 * Handle a request to /actions.
 */
class ActionsHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    res.json(thing.getActionDescriptions());
  }

  /**
   * Handle a POST request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  post(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    let response = {};
    for (const actionName in req.body) {
      let input = null;
      if (req.body[actionName].hasOwnProperty('input')) {
        input = req.body[actionName].input;
      }

      const action = thing.performAction(actionName, input);
      if (action) {
        response = Object.assign(response, action.asActionDescription());
        action.start();
      }
    }

    res.status(201);
    res.json(response);
  }
}

/**
 * Handle a request to /actions/<action_name>.
 */
class ActionHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const actionName = req.params.actionName;

    res.json(thing.getActionDescriptions(actionName));
  }

  /**
   * Handle a POST request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  post(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const actionName = req.params.actionName;

    let response = {};
    for (const name in req.body) {
      if (name !== actionName) {
        continue;
      }

      let input = null;
      if (req.body[name].hasOwnProperty('input')) {
        input = req.body[name].input;
      }

      const action = thing.performAction(name, input);
      if (action) {
        response = Object.assign(response, action.asActionDescription());
        action.start();
      }
    }

    res.status(201);
    res.json(response);
  }
}

/**
 * Handle a request to /actions/<action_name>/<action_id>.
 */
class ActionIDHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const actionName = req.params.actionName;
    const actionId = req.params.actionId;

    const action = thing.getAction(actionName, actionId);
    if (action === null) {
      res.status(404).end();
      return;
    }

    res.json(action.asActionDescription());
  }

  /**
   * Handle a PUT request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  put(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    // TODO: this is not yet defined in the spec
    res.status(200).end();
  }

  /**
   * Handle a DELETE request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  delete(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const actionName = req.params.actionName;
    const actionId = req.params.actionId;

    if (thing.removeAction(actionName, actionId)) {
      res.status(204).end();
    } else {
      res.status(404).end();
    }
  }
}

/**
 * Handle a request to /events.
 */
class EventsHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    res.json(thing.getEventDescriptions());
  }
}

/**
 * Handle a request to /events/<event_name>.
 */
class EventHandler extends BaseHandler {
  /**
   * Handle a GET request.
   *
   * @param {Object} req The request object
   * @param {Object} res The response object
   */
  get(req, res) {
    const thing = this.getThing(req);
    if (thing === null) {
      res.status(404).end();
      return;
    }

    const eventName = req.params.eventName;

    res.json(thing.getEventDescriptions(eventName));
  }
}

/**
 * Server to represent a Web Thing over HTTP.
 */
class WebThingServer {
  /**
   * Initialize the WebThingServer.
   *
   * @param {Object} things Things managed by this server -- should be of type
   *                        SingleThing or MultipleThings
   * @param {Number} port Port to listen on (defaults to 80)
   * @param {String} hostname Optional host name, i.e. mything.com
   * @param {Object} sslOptions SSL options to pass to the express server
   */
  constructor(things, port, hostname, sslOptions) {
    this.things = things;
    this.name = things.getName();
    this.port = Number(port) || (sslOptions ? 443 : 80);
    this.hostname = hostname;

    const systemHostname = os.hostname().toLowerCase();
    this.hosts = [
      'localhost',
      `localhost:${port}`,
      `${systemHostname}.local`,
      `${systemHostname}.local:${port}`,
    ];

    utils.getAddresses().forEach((address) => {
      this.hosts.push(address, `${address}:${port}`);
    });

    if (hostname) {
      hostname = hostname.toLowerCase();
      this.hosts.push(hostname, `${hostname}:${port}`);
    }

    if (this.things.constructor.name === 'MultipleThings') {
      const list = things.getThings();
      for (let i = 0; i < list.length; i++) {
        const thing = list[i];
        thing.setHrefPrefix(`/${i}`);
      }
    }

    this.app = express();
    this.app.use(bodyParser.json());

    // Validate Host header
    this.app.use((request, response, next) => {
      const host = request.headers.host;
      if (this.hosts.includes(host.toLowerCase())) {
        next();
      } else {
        response.status(403).send('Forbidden');
      }
    });

    // Set CORS headers
    this.app.use((request, response, next) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Headers',
                         'Origin, X-Requested-With, Content-Type, Accept');
      response.setHeader('Access-Control-Allow-Methods',
                         'GET, HEAD, PUT, POST, DELETE');
      next();
    });

    if (sslOptions) {
      this.server = https.createServer(sslOptions);
      this.app.isTls = true;
    } else {
      this.server = http.createServer();
      this.app.isTls = false;
    }

    const thingsHandler = new ThingsHandler(this.things);
    const thingHandler = new ThingHandler(this.things);
    const propertiesHandler = new PropertiesHandler(this.things);
    const propertyHandler = new PropertyHandler(this.things);
    const actionsHandler = new ActionsHandler(this.things);
    const actionHandler = new ActionHandler(this.things);
    const actionIdHandler = new ActionIDHandler(this.things);
    const eventsHandler = new EventsHandler(this.things);
    const eventHandler = new EventHandler(this.things);

    if (this.things.constructor.name === 'MultipleThings') {
      this.app.get('/', (req, res) => thingsHandler.get(req, res));
      this.app.get('/:thingId', (req, res) => thingHandler.get(req, res));
      this.app.get('/:thingId/properties',
                   (req, res) => propertiesHandler.get(req, res));
      this.app.get('/:thingId/properties/:propertyName',
                   (req, res) => propertyHandler.get(req, res));
      this.app.put('/:thingId/properties/:propertyName',
                   (req, res) => propertyHandler.put(req, res));
      this.app.get('/:thingId/actions',
                   (req, res) => actionsHandler.get(req, res));
      this.app.post('/:thingId/actions',
                    (req, res) => actionsHandler.post(req, res));
      this.app.get('/:thingId/actions/:actionName',
                   (req, res) => actionHandler.get(req, res));
      this.app.post('/:thingId/actions/:actionName',
                    (req, res) => actionHandler.post(req, res));
      this.app.get('/:thingId/actions/:actionName/:actionId',
                   (req, res) => actionIdHandler.get(req, res));
      this.app.put('/:thingId/actions/:actionName/:actionId',
                   (req, res) => actionIdHandler.put(req, res));
      this.app.delete('/:thingId/actions/:actionName/:actionId',
                      (req, res) => actionIdHandler.delete(req, res));
      this.app.get('/:thingId/events',
                   (req, res) => eventsHandler.get(req, res));
      this.app.get('/:thingId/events/:eventName',
                   (req, res) => eventHandler.get(req, res));
    } else {
      this.app.get('/', (req, res) => thingHandler.get(req, res));
      this.app.get('/properties',
                   (req, res) => propertiesHandler.get(req, res));
      this.app.get('/properties/:propertyName',
                   (req, res) => propertyHandler.get(req, res));
      this.app.put('/properties/:propertyName',
                   (req, res) => propertyHandler.put(req, res));
      this.app.get('/actions',
                   (req, res) => actionsHandler.get(req, res));
      this.app.post('/actions',
                    (req, res) => actionsHandler.post(req, res));
      this.app.get('/actions/:actionName',
                   (req, res) => actionHandler.get(req, res));
      this.app.post('/actions/:actionName',
                    (req, res) => actionHandler.post(req, res));
      this.app.get('/actions/:actionName/:actionId',
                   (req, res) => actionIdHandler.get(req, res));
      this.app.put('/actions/:actionName/:actionId',
                   (req, res) => actionIdHandler.put(req, res));
      this.app.delete('/actions/:actionName/:actionId',
                      (req, res) => actionIdHandler.delete(req, res));
      this.app.get('/events',
                   (req, res) => eventsHandler.get(req, res));
      this.app.get('/events/:eventName',
                   (req, res) => eventHandler.get(req, res));
    }

    this.server.on('request', this.app);
  }

  /**
   * Start listening for incoming connections.
   */
  start() {
    return this.server.start();
   }

  /**
   * Stop listening.
   */
  stop() {
    return this.server.close();
  }
}

module.exports = {
  MultipleThings,
  SingleThing,
  WebThingServer,
};
