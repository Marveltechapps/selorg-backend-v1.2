'use strict';

const amqplib = require('amqplib');
const logger = require('../utils/logger');
const { getConfig } = require('./env');

let connection = null;
let channel = null;
let connecting = null;

async function connect() {
  if (channel) return { connection, channel };
  if (connecting) return connecting;

  const cfg = getConfig();
  if (!cfg.RABBITMQ_URL) {
    logger.warn('RABBITMQ_URL not set; RabbitMQ disabled for logistics module');
    return { connection: null, channel: null };
  }

  connecting = (async () => {
    try {
      connection = await amqplib.connect(cfg.RABBITMQ_URL);
      channel = await connection.createChannel();

      connection.on('error', (err) => logger.error('rabbitmq connection error', { error: err.message }));
      connection.on('close', () => {
        logger.warn('rabbitmq connection closed');
        connection = null;
        channel = null;
      });

      logger.info('rabbitmq connected');
      return { connection, channel };
    } catch (err) {
      logger.error('rabbitmq connection failed', { error: err.message });
      connection = null;
      channel = null;
      throw err;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

async function close() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    logger.error('rabbitmq close error', { error: err.message });
  } finally {
    channel = null;
    connection = null;
  }
}

function isReady() {
  return Boolean(channel);
}

function getChannel() {
  return channel;
}

module.exports = { connect, close, isReady, getChannel };
