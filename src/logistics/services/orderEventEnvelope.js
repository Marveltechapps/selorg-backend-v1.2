'use strict';

const { v4: uuidv4 } = require('uuid');

function buildEnvelope(eventType, data) {
  return {
    eventId: uuidv4(),
    eventType,
    version: 1,
    timestamp: new Date().toISOString(),
    data,
  };
}

module.exports = { buildEnvelope };
